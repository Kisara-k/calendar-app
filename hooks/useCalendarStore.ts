"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { loadDemoCalendar, loadEmptyCalendar, normalizeCalendarData } from "@/lib/calendar/seed";
import type {
  CalendarBlock,
  CalendarData,
  CalendarSettings,
  Layer,
} from "@/lib/calendar/types";
import type { RecurrenceRule, RecurrenceScope } from "@/lib/calendar/types";
import {
  applyScopedUpdate,
  createSeries,
  removeScoped,
} from "@/lib/calendar/recurrence";
import {
  applyPatch,
  diffSnapshots,
  fetchChangedSnapshot,
  fetchSnapshot,
  fromDatabaseSnapshot,
  isRevisionConflict,
  mergeSnapshots,
  normalizeDatabaseSnapshot,
  patchIsEmpty,
  seedUserNames,
  toDatabaseSnapshot,
  type DatabaseSnapshot,
} from "@/lib/supabase/database";
import { saveModeForChangedFields, saveModeForPatch, type SaveMode } from "@/lib/supabase/write-policy";
import { getSupabase } from "@/lib/supabase/client";
import {
  deleteOutboxRecords,
  getCachedSnapshot,
  listOutboxRecords,
  putCachedSnapshot,
  putOutboxRecord,
  type OutboxRecord,
} from "@/lib/supabase/persistence";

const HISTORY_LIMIT = 50;
const SAVE_DEBOUNCE = 350;
const SAVE_MAX_WAIT = 1500;
const OUTBOX_LEASE = 60000;
const BUFFERED_BLOCK_FIELDS = new Set<keyof CalendarBlock>(["title", "notes"]);
const BUFFERED_SETTING_FIELDS = new Set<keyof CalendarSettings>([
  "hourScale",
  "underlayOpacity",
]);
export type SyncStatus =
  | "loading"
  | "synced"
  | "pending"
  | "offline"
  | "error"
  | "quota"
  | "conflict";

const blockSaveMode = (before: CalendarBlock | undefined, after: CalendarBlock) =>
  saveModeForChangedFields(before, after, BUFFERED_BLOCK_FIELDS);

export function useCalendarStore(user: User) {
  const [data, setData] = useState<CalendarData>(() => loadEmptyCalendar());
  const dataRef = useRef(data);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [past, setPast] = useState<CalendarData[]>([]);
  const [future, setFuture] = useState<CalendarData[]>([]);
  const [undo, setUndo] = useState<{ label: string } | null>(null);
  const [syncConflict, setSyncConflict] = useState<{ paths: string[] } | null>(
    null,
  );
  const [unsaved, setUnsaved] = useState(false);
  const clientIdRef = useRef(crypto.randomUUID()),
    outboxId = `${user.id}:${clientIdRef.current}`;
  const baseRef = useRef<DatabaseSnapshot | null>(null),
    lastCommitIdRef = useRef<string | null>(null),
    firstSyncBaseRef = useRef<DatabaseSnapshot | null>(null),
    initializedRef = useRef(false),
    dirtyRef = useRef(false),
    inFlightRef = useRef(false),
    mutationRef = useRef<{ target: CalendarData; id: string } | null>(null),
    flushTimerRef = useRef<number | null>(null),
    maxFlushTimerRef = useRef<number | null>(null),
    refreshTimerRef = useRef<number | null>(null),
    flushRef = useRef<() => void>(() => {}),
    refreshRef = useRef<() => void>(() => {}),
    revisionHintRef = useRef(0),
    pendingFlushDelayRef = useRef(SAVE_DEBOUNCE),
    persistenceRef = useRef<Promise<void>>(Promise.resolve()),
    recoveredRef = useRef<string[]>([]),
    conflictRef = useRef<{
      remote: DatabaseSnapshot;
      serverMerged: DatabaseSnapshot;
      paths: string[];
    } | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const scheduleFlush = useCallback((delay = SAVE_DEBOUNCE) => {
    if (flushTimerRef.current !== null)
      window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => flushRef.current(), delay);
  }, []);
  const cacheSnapshot = useCallback(
    (snapshot: DatabaseSnapshot) => {
      void putCachedSnapshot(
        user.id,
        structuredClone(normalizeDatabaseSnapshot(snapshot)),
      ).catch(() => {});
    },
    [user.id],
  );
  const persistOutbox = useCallback(
    (pending = dataRef.current) => {
      const base = baseRef.current ?? firstSyncBaseRef.current;
      if (!base) return Promise.resolve();
      const mutation = mutationRef.current,
        record: OutboxRecord = {
          id: outboxId,
          userId: user.id,
          clientId: clientIdRef.current,
          base: structuredClone(base),
          pending: structuredClone(pending),
          mutationId: mutation?.id ?? null,
          mutationTarget: mutation ? structuredClone(mutation.target) : null,
          updatedAt: Date.now(),
          leaseUntil: Date.now() + OUTBOX_LEASE,
        };
      const queued = persistenceRef.current
        .catch(() => {})
        .then(() => putOutboxRecord(record));
      persistenceRef.current = queued;
      return queued;
    },
    [outboxId, user.id],
  );
  const cleanupRecovered = useCallback(() => {
    const ids = recoveredRef.current.filter((id) => id !== outboxId);
    recoveredRef.current = [];
    if (!ids.length) return;
    const queued = persistenceRef.current
      .catch(() => {})
      .then(() => deleteOutboxRecords(ids));
    persistenceRef.current = queued;
    void queued.catch(() => {});
  }, [outboxId]);
  const clearOutbox = useCallback(() => {
    const ids = Array.from(new Set([outboxId, ...recoveredRef.current]));
    recoveredRef.current = [];
    const queued = persistenceRef.current
      .catch(() => {})
      .then(() => deleteOutboxRecords(ids));
    persistenceRef.current = queued;
    void queued.catch(() => {});
  }, [outboxId]);
  const markDirty = useCallback(
    (next: CalendarData, mode: SaveMode = "immediate") => {
      dirtyRef.current = true;
      pendingFlushDelayRef.current = mode === "immediate" ? 0 : SAVE_DEBOUNCE;
      setUnsaved(true);
      void persistOutbox(next).catch(() => {});
      setSyncStatus(
        conflictRef.current
          ? "conflict"
          : navigator.onLine
            ? "pending"
            : "offline",
      );
      if (initializedRef.current && !conflictRef.current) {
        scheduleFlush(pendingFlushDelayRef.current);
        if (maxFlushTimerRef.current === null)
          maxFlushTimerRef.current = window.setTimeout(() => {
            maxFlushTimerRef.current = null;
            flushRef.current();
          }, SAVE_MAX_WAIT);
      }
    },
    [persistOutbox, scheduleFlush],
  );
  const acceptRemote = useCallback(
    (snapshot: DatabaseSnapshot, resetHistory = false) => {
      const normalized = normalizeDatabaseSnapshot(snapshot),
        next = fromDatabaseSnapshot(normalized);
      baseRef.current = normalized;
      firstSyncBaseRef.current = null;
      dataRef.current = next;
      mutationRef.current = null;
      conflictRef.current = null;
      if (revisionHintRef.current <= normalized.revision)
        revisionHintRef.current = 0;
      setSyncConflict(null);
      setData(next);
      if (resetHistory) {
        lastCommitIdRef.current = null;
        setPast([]);
        setFuture([]);
      }
      dirtyRef.current = false;
      setUnsaved(false);
      clearOutbox();
      cacheSnapshot(normalized);
      setSyncStatus("synced");
    },
    [cacheSnapshot, clearOutbox],
  );
  const flush = useCallback(async () => {
    if (
      !initializedRef.current ||
      inFlightRef.current ||
      !dirtyRef.current ||
      conflictRef.current
    )
      return;
    if (flushTimerRef.current !== null)
      window.clearTimeout(flushTimerRef.current);
    if (maxFlushTimerRef.current !== null)
      window.clearTimeout(maxFlushTimerRef.current);
    flushTimerRef.current = null;
    maxFlushTimerRef.current = null;
    const base = baseRef.current,
      target = mutationRef.current?.target ?? dataRef.current,
      targetSnapshot = toDatabaseSnapshot(target, base?.revision ?? 0),
      patch = diffSnapshots(base, targetSnapshot);
    if (patchIsEmpty(patch)) {
      baseRef.current = targetSnapshot;
      firstSyncBaseRef.current = null;
      mutationRef.current = null;
      dirtyRef.current = dataRef.current !== target;
      cacheSnapshot(targetSnapshot);
      if (dirtyRef.current) {
        void persistOutbox(dataRef.current)
          .then(cleanupRecovered)
          .catch(() => {});
        setSyncStatus("pending");
        scheduleFlush(pendingFlushDelayRef.current);
      } else {
        setUnsaved(false);
        clearOutbox();
        setSyncStatus("synced");
      }
      return;
    }
    const mutation = mutationRef.current ?? { target, id: crypto.randomUUID() };
    mutationRef.current = mutation;
    inFlightRef.current = true;
    let retry = false;
    setSyncStatus(navigator.onLine ? "pending" : "offline");
    try {
      await persistOutbox(dataRef.current).catch(() => {});
      const revision = await applyPatch(
        patch,
        mutation.id,
        base?.revision ?? 0,
      );
      targetSnapshot.revision = revision;
      mutationRef.current = null;
      baseRef.current = targetSnapshot;
      firstSyncBaseRef.current = null;
      cacheSnapshot(targetSnapshot);
      if (dataRef.current !== target) {
        dirtyRef.current = true;
        void persistOutbox(dataRef.current)
          .then(cleanupRecovered)
          .catch(() => {});
        scheduleFlush(pendingFlushDelayRef.current);
      } else {
        dirtyRef.current = false;
        setUnsaved(false);
        clearOutbox();
        setSyncStatus("synced");
      }
    } catch (error) {
      dirtyRef.current = true;
      setUnsaved(true);
      const mergeBase = base ?? firstSyncBaseRef.current;
      if (isRevisionConflict(error) && mergeBase) {
        try {
          const remote = await fetchChangedSnapshot(mergeBase);
          if (!remote) throw error;
          const local = toDatabaseSnapshot(dataRef.current, mergeBase.revision),
            result = mergeSnapshots(mergeBase, local, remote),
            serverResult = mergeSnapshots(mergeBase, remote, local),
            merged = fromDatabaseSnapshot(result.snapshot);
          serverResult.snapshot.revision = remote.revision;
          baseRef.current = remote;
          firstSyncBaseRef.current = null;
          dataRef.current = merged;
          mutationRef.current = null;
          setData(merged);
          lastCommitIdRef.current = null;
          setPast([]);
          setFuture([]);
          cacheSnapshot(remote);
          if (result.conflicts.length) {
            conflictRef.current = {
              remote,
              serverMerged: serverResult.snapshot,
              paths: result.conflicts,
            };
            setSyncConflict({ paths: result.conflicts });
            setSyncStatus("conflict");
            void persistOutbox(merged)
              .then(cleanupRecovered)
              .catch(() => {});
          } else {
            dirtyRef.current = !patchIsEmpty(
              diffSnapshots(remote, result.snapshot),
            );
            if (dirtyRef.current) {
              void persistOutbox(merged)
                .then(cleanupRecovered)
                .catch(() => {});
              setSyncStatus("pending");
              scheduleFlush(pendingFlushDelayRef.current);
            } else acceptRemote(remote, true);
          }
        } catch {
          setSyncStatus(navigator.onLine ? "error" : "offline");
        }
      } else {
        const message =
            typeof error === "object" && error && "message" in error
              ? String(error.message)
              : String(error),
          quota = message.toLowerCase().includes("storage quota exceeded");
        if (quota) {
          mutationRef.current = null;
          void persistOutbox(dataRef.current).catch(() => {});
        }
        setSyncStatus(
          !navigator.onLine ? "offline" : quota ? "quota" : "error",
        );
        retry = navigator.onLine && !quota;
      }
    } finally {
      inFlightRef.current = false;
      if (
        dirtyRef.current &&
        !conflictRef.current &&
        (dataRef.current !== target || retry)
      )
        scheduleFlush(retry ? 1500 : pendingFlushDelayRef.current);
      else if (
        !dirtyRef.current &&
        !conflictRef.current &&
        revisionHintRef.current
      ) {
        if (revisionHintRef.current === baseRef.current?.revision)
          revisionHintRef.current = 0;
        else window.setTimeout(() => refreshRef.current(), 0);
      }
    }
  }, [
    acceptRemote,
    cacheSnapshot,
    cleanupRecovered,
    clearOutbox,
    persistOutbox,
    scheduleFlush,
  ]);
  flushRef.current = flush;
  useEffect(() => {
    let active = true,
      cached: DatabaseSnapshot | null = null,
      recoverable: OutboxRecord[] = [];
    const activeClients = new Set<string>(),
      outboxChannel =
        typeof BroadcastChannel === "undefined"
          ? null
          : new BroadcastChannel(`calendar-outbox:${user.id}`);
    if (outboxChannel) {
      outboxChannel.onmessage = (event) => {
        const message = event.data;
        if (!message || message.clientId === clientIdRef.current) return;
        if (message.type === "ping")
          outboxChannel.postMessage({
            type: "pong",
            clientId: clientIdRef.current,
            to: message.clientId,
          });
        else if (message.type === "pong" && message.to === clientIdRef.current)
          activeClients.add(message.clientId);
      };
      outboxChannel.postMessage({
        type: "ping",
        clientId: clientIdRef.current,
      });
    }
    initializedRef.current = false;
    dirtyRef.current = false;
    conflictRef.current = null;
    firstSyncBaseRef.current = null;
    mutationRef.current = null;
    recoveredRef.current = [];
    revisionHintRef.current = 0;
    setUnsaved(false);
    setSyncConflict(null);
    setReady(false);
    setSyncStatus("loading");
    const initialize = async () => {
      const [stored, storedRecords] = await Promise.all([
        getCachedSnapshot(user.id),
        listOutboxRecords(user.id),
      ]);
      cached = stored ? normalizeDatabaseSnapshot(stored) : null;
      const records = storedRecords.map((record) => ({
        ...record,
        base: normalizeDatabaseSnapshot(record.base),
      }));
      if (cached) {
        baseRef.current = cached;
        dataRef.current = fromDatabaseSnapshot(cached);
        setData(dataRef.current);
      }
      if (outboxChannel) {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        if (!active) return;
        outboxChannel.postMessage({
          type: "ping",
          clientId: clientIdRef.current,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      }
      if (!active) return;
      const now = Date.now();
      recoverable = records
        .filter(
          (record) =>
            record.clientId === clientIdRef.current ||
            (outboxChannel
              ? !activeClients.has(record.clientId)
              : record.leaseUntil < now),
        )
        .sort((a, b) => a.updatedAt - b.updatedAt);
      if (recoverable.length) {
        const seed = seedUserNames(loadDemoCalendar(), user),
          sources = [
            ...(cached ? [cached] : []),
            ...recoverable.map((record) => record.base),
          ].sort((a, b) => a.revision - b.revision),
          source = sources.at(-1) ?? toDatabaseSnapshot(seed, 0),
          remote = await fetchChangedSnapshot(source);
        if (!remote && source.revision > 0)
          throw new Error("Workspace cursor unavailable");
        const authoritative = remote ?? source;
        let localBranch = authoritative,
          serverBranch = authoritative;
        const conflicts = new Set<string>();
        for (const record of recoverable) {
          const pending = toDatabaseSnapshot(
              record.pending,
              record.base.revision,
            ),
            localResult = mergeSnapshots(record.base, pending, localBranch),
            serverResult = mergeSnapshots(record.base, serverBranch, pending);
          localBranch = localResult.snapshot;
          serverBranch = serverResult.snapshot;
          localResult.conflicts.forEach((path) => conflicts.add(path));
        }
        localBranch.revision = authoritative.revision;
        serverBranch.revision = authoritative.revision;
        baseRef.current = remote;
        firstSyncBaseRef.current = remote ? null : authoritative;
        recoveredRef.current = recoverable.map((record) => record.id);
        const next = fromDatabaseSnapshot(localBranch);
        dataRef.current = next;
        setData(next);
        lastCommitIdRef.current = null;
        setPast([]);
        setFuture([]);
        if (remote) cacheSnapshot(remote);
        dirtyRef.current = !patchIsEmpty(diffSnapshots(remote, localBranch));
        setUnsaved(dirtyRef.current);
        if (conflicts.size) {
          const paths = [...conflicts];
          conflictRef.current = {
            remote: authoritative,
            serverMerged: serverBranch,
            paths,
          };
          setSyncConflict({ paths });
          setSyncStatus("conflict");
          void persistOutbox(next)
            .then(cleanupRecovered)
            .catch(() => {});
        } else if (dirtyRef.current) {
          setSyncStatus("pending");
          void persistOutbox(next)
            .then(cleanupRecovered)
            .catch(() => {});
        } else acceptRemote(authoritative, true);
      } else if (cached) {
        const remote = await fetchChangedSnapshot(cached);
        if (!remote) throw new Error("Workspace cursor unavailable");
        acceptRemote(remote, remote.revision !== cached.revision);
      } else {
        const remote = await fetchSnapshot(user.id);
        if (remote) acceptRemote(remote, true);
        else {
          const seed = seedUserNames(loadDemoCalendar(), user),
            snapshot = toDatabaseSnapshot(seed, 0);
          baseRef.current = null;
          firstSyncBaseRef.current = snapshot;
          dataRef.current = seed;
          setData(seed);
          dirtyRef.current = true;
          setUnsaved(true);
          setSyncStatus("pending");
          void persistOutbox(seed).catch(() => {});
        }
      }
      if (!active) return;
      initializedRef.current = true;
      setReady(true);
      if (dirtyRef.current && !conflictRef.current) scheduleFlush(0);
      else if (
        revisionHintRef.current &&
        revisionHintRef.current !== baseRef.current?.revision
      )
        window.setTimeout(() => refreshRef.current(), 0);
    };
    void initialize().catch(() => {
      if (!active) return;
      const latest = recoverable.at(-1);
      if (latest) {
        const firstSync = latest.base.revision === 0;
        baseRef.current = firstSync ? null : latest.base;
        firstSyncBaseRef.current = firstSync ? latest.base : null;
        recoveredRef.current = recoverable.map((record) => record.id);
        dataRef.current = latest.pending;
        setData(latest.pending);
        mutationRef.current =
          latest.mutationId && latest.mutationTarget
            ? { id: latest.mutationId, target: latest.mutationTarget }
            : null;
        dirtyRef.current = true;
        setUnsaved(true);
        void persistOutbox(latest.pending)
          .then(cleanupRecovered)
          .catch(() => {});
      } else if (!cached) {
        const seed = seedUserNames(loadDemoCalendar(), user);
        baseRef.current = null;
        firstSyncBaseRef.current = toDatabaseSnapshot(seed, 0);
        dataRef.current = seed;
        setData(seed);
      }
      initializedRef.current = true;
      setReady(true);
      setSyncStatus(navigator.onLine ? "error" : "offline");
      if (latest && navigator.onLine) scheduleFlush(1500);
    });
    return () => {
      active = false;
      initializedRef.current = false;
      outboxChannel?.close();
      if (flushTimerRef.current !== null)
        window.clearTimeout(flushTimerRef.current);
      if (maxFlushTimerRef.current !== null)
        window.clearTimeout(maxFlushTimerRef.current);
      flushTimerRef.current = null;
      maxFlushTimerRef.current = null;
    };
  }, [
    acceptRemote,
    cacheSnapshot,
    cleanupRecovered,
    persistOutbox,
    scheduleFlush,
    user,
  ]);
  useEffect(() => {
    const refresh = () => {
      if (!initializedRef.current || conflictRef.current) return;
      if (dirtyRef.current || inFlightRef.current) {
        scheduleFlush(0);
        return;
      }
      const base = baseRef.current;
      if (!base) return;
      const hinted = revisionHintRef.current;
      if (hinted && hinted <= base.revision) {
        revisionHintRef.current = 0;
        return;
      }
      revisionHintRef.current = 0;
      void fetchChangedSnapshot(base)
        .then((remote) => {
          if (
            remote &&
            remote.revision !== baseRef.current?.revision &&
            !dirtyRef.current &&
            !inFlightRef.current
          )
            acceptRemote(remote, true);
        })
        .catch(() => setSyncStatus(navigator.onLine ? "error" : "offline"));
    };
    refreshRef.current = refresh;
    const online = () => {
        setSyncStatus(dirtyRef.current ? "pending" : "synced");
        dirtyRef.current ? scheduleFlush(0) : refresh();
      },
      visibility = () => {
        if (document.visibilityState === "hidden") {
          if (dirtyRef.current) flushRef.current();
        } else refresh();
      },
      pagehide = () => {
        if (dirtyRef.current) flushRef.current();
      };
    window.addEventListener("online", online);
    window.addEventListener("focus", refresh);
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", visibility);
    const channel = getSupabase()
      .channel(`user:${user.id}`, { config: { private: true } })
      .on("broadcast", { event: "workspace_changed" }, (message) => {
        const revision = Number(message.payload?.revision);
        if (Number.isFinite(revision))
          revisionHintRef.current = Math.max(revisionHintRef.current, revision);
        if (refreshTimerRef.current !== null)
          window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = window.setTimeout(refresh, 180);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", visibility);
      if (refreshTimerRef.current !== null)
        window.clearTimeout(refreshTimerRef.current);
      void getSupabase().removeChannel(channel);
    };
  }, [acceptRemote, scheduleFlush, user.id]);
  useEffect(() => {
    if (!unsaved) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [unsaved]);

  const resolveSyncConflict = useCallback(
    (choice: "local" | "remote") => {
      const conflict = conflictRef.current;
      if (!conflict) return;
      const chosen =
          choice === "local"
            ? toDatabaseSnapshot(dataRef.current, conflict.remote.revision)
            : conflict.serverMerged,
        next = fromDatabaseSnapshot(chosen);
      baseRef.current = conflict.remote;
      firstSyncBaseRef.current = null;
      conflictRef.current = null;
      setSyncConflict(null);
      dataRef.current = next;
      setData(next);
      lastCommitIdRef.current = null;
      setPast([]);
      setFuture([]);
      dirtyRef.current = !patchIsEmpty(diffSnapshots(conflict.remote, chosen));
      setUnsaved(dirtyRef.current);
      mutationRef.current = null;
      cacheSnapshot(conflict.remote);
      setSyncStatus(dirtyRef.current ? "pending" : "synced");
      if (dirtyRef.current) {
        void persistOutbox(next)
          .then(cleanupRecovered)
          .catch(() => {});
        scheduleFlush(0);
      } else clearOutbox();
    },
    [
      cacheSnapshot,
      cleanupRecovered,
      clearOutbox,
      persistOutbox,
      scheduleFlush,
    ],
  );

  const commit = useCallback(
    (
      change: (current: CalendarData) => CalendarData,
      mode: SaveMode = "immediate",
      replaceCommitId?: string,
    ) => {
      if (!initializedRef.current) return null;
      if (replaceCommitId) {
        if (lastCommitIdRef.current !== replaceCommitId) return null;
        setPast((items) => {
          if (!items.length) return items;
          const next = change(items[items.length - 1]);
          setFuture([]);
          dataRef.current = next;
          markDirty(next, mode);
          setData(next);
          return items;
        });
        return replaceCommitId;
      }
      const commitId = crypto.randomUUID();
      lastCommitIdRef.current = commitId;
      setData((current) => {
        setPast((items) => [
          ...items.slice(-(HISTORY_LIMIT - 1)),
          structuredClone(current),
        ]);
        setFuture([]);
        const next = change(current);
        dataRef.current = next;
        markDirty(next, mode);
        return next;
      });
      return commitId;
    },
    [markDirty],
  );
  const undoHistory = useCallback(() => {
    if (!initializedRef.current) return;
    lastCommitIdRef.current = null;
    setPast((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setFuture((next) =>
        [structuredClone(dataRef.current), ...next].slice(0, HISTORY_LIMIT),
      );
      dataRef.current = previous;
      markDirty(previous);
      setData(previous);
      return items.slice(0, -1);
    });
  }, [markDirty]);
  const redoHistory = useCallback(() => {
    if (!initializedRef.current) return;
    lastCommitIdRef.current = null;
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setPast((previous) =>
        [...previous, structuredClone(dataRef.current)].slice(-HISTORY_LIMIT),
      );
      dataRef.current = next;
      markDirty(next);
      setData(next);
      return items.slice(1);
    });
  }, [markDirty]);

  const addBlock = useCallback(
    (block: CalendarBlock) =>
      commit((v) => ({ ...v, blocks: [...v.blocks, block] })),
    [commit],
  );
  const addBlocks = useCallback(
    (blocks: CalendarBlock[]) =>
      commit((v) => ({ ...v, blocks: [...v.blocks, ...blocks] })),
    [commit],
  );
  const createBlock = useCallback(
    (block: Omit<CalendarBlock, "id">) => {
      const created = { ...block, id: crypto.randomUUID() };
      addBlock(created);
      return created;
    },
    [addBlock],
  );
  const updateBlock = useCallback(
    (block: CalendarBlock) =>
      commit(
        (v) => ({
          ...v,
          blocks: v.blocks.map((b) => (b.id === block.id ? block : b)),
        }),
        blockSaveMode(
          dataRef.current.blocks.find((item) => item.id === block.id),
          block,
        ),
      ),
    [commit],
  );
  const updateRecurringBlock = useCallback(
    (
      original: CalendarBlock,
      block: CalendarBlock,
      scope: RecurrenceScope,
      replaceCommitId?: string,
    ) =>
      commit(
        (v) => ({
          ...v,
          blocks: applyScopedUpdate(v.blocks, original, block, scope),
        }),
        blockSaveMode(original, block),
        replaceCommitId,
      ),
    [commit],
  );
  const updateBlocks = useCallback(
    (changes: CalendarBlock[]) => {
      const map = new Map(changes.map((b) => [b.id, b]));
      commit((v) => ({
        ...v,
        blocks: v.blocks.map((b) => map.get(b.id) ?? b),
      }));
    },
    [commit],
  );
  const deleteBlocks = useCallback(
    (ids: string[]) => {
      commit((v) => ({
        ...v,
        blocks: v.blocks.filter((b) => !ids.includes(b.id)),
      }));
      setUndo({
        label: `Deleted ${ids.length === 1 ? "block" : `${ids.length} blocks`}`,
      });
    },
    [commit],
  );
  const deleteRecurringBlock = useCallback(
    (block: CalendarBlock, scope: RecurrenceScope) => {
      commit((v) => ({ ...v, blocks: removeScoped(v.blocks, block, scope) }));
      setUndo({
        label:
          scope === "only"
            ? "Deleted event"
            : scope === "following"
              ? "Deleted this and following events"
              : "Deleted recurring series",
      });
    },
    [commit],
  );
  const setBlockRecurrence = useCallback(
    (block: CalendarBlock, rule: RecurrenceRule | null) =>
      commit((v) => {
        const current = v.blocks.find((b) => b.id === block.id) ?? block;
        if (!rule) {
          if (!current.seriesId) return v;
          return {
            ...v,
            blocks: v.blocks.map((b) =>
              b.id === current.id
                ? {
                    ...b,
                    seriesId: undefined,
                    recurrence: undefined,
                    occurrenceIndex: undefined,
                    recurrenceDate: undefined,
                    recurrenceStart: undefined,
                    recurrenceEnd: undefined,
                  }
                : b,
            ),
          };
        }
        const members = current.seriesId
            ? v.blocks.filter((b) => b.seriesId === current.seriesId)
            : [],
          root =
            members.sort(
              (a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0),
            )[0] ?? current,
          withoutSeries = current.seriesId
            ? v.blocks.filter((b) => b.seriesId !== current.seriesId)
            : v.blocks.filter((b) => b.id !== current.id);
        return {
          ...v,
          blocks: [
            ...withoutSeries,
            ...createSeries(
              {
                ...root,
                date: root.recurrenceDate ?? root.date,
                start: root.start,
                end: root.end,
                seriesId: undefined,
                recurrence: undefined,
                occurrenceIndex: undefined,
                recurrenceDate: undefined,
                recurrenceStart: undefined,
                recurrenceEnd: undefined,
              },
              rule,
            ),
          ],
        };
      }, "debounced"),
    [commit],
  );
  const patchSettings = useCallback(
    (patch: Partial<CalendarSettings>) =>
      commit(
        (v) => ({ ...v, settings: { ...v.settings, ...patch } }),
        saveModeForPatch(patch, BUFFERED_SETTING_FIELDS),
      ),
    [commit],
  );
  const toggleCategory = useCallback(
    (id: string) =>
      commit((v) => ({
        ...v,
        categories: v.categories.map((c) =>
          c.id === id ? { ...c, visible: !c.visible } : c,
        ),
      })),
    [commit],
  );
  const toggleGroup = useCallback(
    (groupId: string) =>
      commit((v) => {
        const members = v.categories.filter((c) => c.groupId === groupId),
          show = members.some((c) => !c.visible);
        return {
          ...v,
          categories: v.categories.map((c) =>
            c.groupId === groupId ? { ...c, visible: show } : c,
          ),
        };
      }),
    [commit],
  );
  const reorderCategories = useCallback(
    (sourceId: string, targetId: string) =>
      commit((v) => {
        const items = [...v.categories],
          from = items.findIndex((c) => c.id === sourceId),
          to = items.findIndex((c) => c.id === targetId);
        if (from < 0 || to < 0) return v;
        const targetGroup = items[to].groupId;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, { ...moved, groupId: targetGroup });
        return { ...v, categories: items };
      }),
    [commit],
  );
  const moveCategoryToGroup = useCallback(
    (sourceId: string, groupId: string) =>
      commit((v) => {
        const source = v.categories.find((c) => c.id === sourceId);
        if (!source || source.groupId === groupId) return v;
        return {
          ...v,
          categories: [
            ...v.categories.filter((c) => c.id !== sourceId),
            { ...source, groupId },
          ],
        };
      }),
    [commit],
  );
  const applyCategoryLayout = useCallback(
    (layout: { id: string; groupId?: string }[]) =>
      commit((v) => {
        const byId = new Map(v.categories.map((c) => [c.id, c]));
        return {
          ...v,
          categories: layout.map((item) => ({
            ...byId.get(item.id)!,
            groupId: item.groupId,
          })),
        };
      }),
    [commit],
  );
  const reorderGroups = useCallback(
    (sourceId: string, targetId: string) =>
      commit((v) => {
        const items = [...v.groups],
          from = items.findIndex((g) => g.id === sourceId),
          to = items.findIndex((g) => g.id === targetId);
        if (from < 0 || to < 0) return v;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        return { ...v, groups: items };
      }),
    [commit],
  );
  const renameGroup = useCallback(
    (id: string, name: string) =>
      commit((v) => ({
        ...v,
        groups: v.groups.map((g) => (g.id === id ? { ...g, name } : g)),
      })),
    [commit],
  );
  const createGroup = useCallback(() => {
    const group = { id: crypto.randomUUID(), name: "New tab" };
    commit((v) => ({ ...v, groups: [...v.groups, group] }));
    return group;
  }, [commit]);
  const renameCategory = useCallback(
    (id: string, name: string) =>
      commit((v) => ({
        ...v,
        categories: v.categories.map((c) => (c.id === id ? { ...c, name } : c)),
      })),
    [commit],
  );
  const createCategory = useCallback(() => {
    const category = {
      id: crypto.randomUUID(),
      name: "New calendar",
      color: "#7da3e8",
      visible: true,
      groupId: dataRef.current.groups[0]?.id,
    };
    commit((v) => ({ ...v, categories: [...v.categories, category] }));
    return category;
  }, [commit]);
  const colorCategory = useCallback(
    (id: string, color: string) =>
      commit((v) => ({
        ...v,
        categories: v.categories.map((c) =>
          c.id === id ? { ...c, color } : c,
        ),
      })),
    [commit],
  );
  const setDefaultCategory = useCallback(
    (id: string) => patchSettings({ defaultCategoryId: id }),
    [patchSettings],
  );
  const deleteCategory = useCallback(
    (id: string) =>
      commit((v) => {
        if (v.categories.length <= 1) return v;
        const category = v.categories.find((c) => c.id === id);
        if (!category) return v;
        const removedBlocks = v.blocks.filter((b) => b.categoryId === id),
          remaining = v.categories.filter((c) => c.id !== id),
          fallback = remaining[0]?.id ?? "";
        return {
          ...v,
          categories: remaining,
          blocks: v.blocks.filter((b) => b.categoryId !== id),
          deletedCalendars: [
            {
              category,
              blocks: removedBlocks,
              deletedAt: new Date().toISOString(),
            },
            ...(v.deletedCalendars ?? []),
          ],
          settings: {
            ...v.settings,
            defaultCategoryId:
              v.settings.defaultCategoryId === id
                ? fallback
                : v.settings.defaultCategoryId,
            insightsExcludedCategoryIds: (
              v.settings.insightsExcludedCategoryIds ?? []
            ).filter((categoryId) => categoryId !== id),
            favoriteCategoryIds: (
              v.settings.favoriteCategoryIds ?? []
            ).filter((categoryId) => categoryId !== id),
          },
        };
      }),
    [commit],
  );
  const restoreCategory = useCallback(
    (id: string) =>
      commit((v) => {
        const entry = (v.deletedCalendars ?? []).find(
          (item) => item.category.id === id,
        );
        if (!entry) return v;
        return {
          ...v,
          categories: [...v.categories, { ...entry.category, visible: true }],
          blocks: [...v.blocks, ...entry.blocks],
          deletedCalendars: (v.deletedCalendars ?? []).filter(
            (item) => item.category.id !== id,
          ),
        };
      }),
    [commit],
  );
  const mergeCategory = useCallback(
    (sourceId: string, targetId: string) =>
      commit((v) => {
        const excluded = new Set(v.settings.insightsExcludedCategoryIds ?? []);
        const favorites = new Set(v.settings.favoriteCategoryIds ?? []);
        if (excluded.has(sourceId)) excluded.add(targetId);
        excluded.delete(sourceId);
        if (favorites.has(sourceId)) favorites.add(targetId);
        favorites.delete(sourceId);
        return {
          ...v,
          categories: v.categories.filter((c) => c.id !== sourceId),
          blocks: v.blocks.map((b) =>
            b.categoryId === sourceId ? { ...b, categoryId: targetId } : b,
          ),
          settings: {
            ...v.settings,
            defaultCategoryId:
              v.settings.defaultCategoryId === sourceId
                ? targetId
                : v.settings.defaultCategoryId,
            insightsExcludedCategoryIds: Array.from(excluded),
            favoriteCategoryIds: Array.from(favorites),
          },
        };
      }),
    [commit],
  );
  const setQuote = useCallback(
    (quote: string) => commit((v) => ({ ...v, currentQuote: quote })),
    [commit],
  );
  const nextQuote = useCallback(
    () =>
      commit((v) => {
        const choices = v.quoteBank.filter((q) => q !== v.currentQuote),
          next =
            choices[Math.floor(Math.random() * choices.length)] ??
            v.currentQuote;
        return { ...v, currentQuote: next };
      }),
    [commit],
  );
  const copyPlanToActual = useCallback(
    (dates: string[]) => {
      const current = dataRef.current,
        actuals = current.blocks.filter((b) => b.layer === "actual"),
        existing = new Set(
          actuals.filter((b) => b.sourcePlanId).map((b) => b.sourcePlanId),
        ),
        natural = new Set(
          actuals.map((b) => `${b.date}|${b.title.toLocaleLowerCase()}`),
        );
      const copies = current.blocks
        .filter(
          (b) =>
            b.layer === "plan" &&
            !b.allDay &&
            dates.includes(b.date) &&
            !existing.has(b.id) &&
            !natural.has(`${b.date}|${b.title.toLocaleLowerCase()}`),
        )
        .map((b) => ({
          ...b,
          id: crypto.randomUUID(),
          layer: "actual" as Layer,
          sourcePlanId: b.id,
          status: "completed" as const,
          seriesId: undefined,
          recurrence: undefined,
          occurrenceIndex: undefined,
          recurrenceDate: undefined,
          recurrenceStart: undefined,
          recurrenceEnd: undefined,
        }));
      if (copies.length)
        commit((v) => ({ ...v, blocks: [...v.blocks, ...copies] }));
      return copies.length;
    },
    [commit],
  );
  const reset = useCallback(() => commit(() => loadDemoCalendar()), [commit]);
  const replaceData = useCallback(
    (next: CalendarData) => {
      if (
        next.version !== 2 ||
        !Array.isArray(next.blocks) ||
        !Array.isArray(next.categories)
      )
        throw new Error("Unsupported calendar file");
      commit(() => normalizeCalendarData(next));
    },
    [commit],
  );
  const undoDelete = useCallback(() => {
    undoHistory();
    setUndo(null);
  }, [undoHistory]);
  const undoCommit = useCallback(
    (commitId: string) => {
      if (lastCommitIdRef.current !== commitId) return false;
      undoHistory();
      return true;
    },
    [undoHistory],
  );

  return useMemo(
    () => ({
      data,
      ready,
      syncStatus,
      syncConflict,
      resolveSyncConflict,
      undo,
      setUndo,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoHistory,
      redoHistory,
      undoCommit,
      undoDelete,
      addBlock,
      addBlocks,
      createBlock,
      updateBlock,
      updateRecurringBlock,
      updateBlocks,
      deleteBlocks,
      deleteRecurringBlock,
      setBlockRecurrence,
      patchSettings,
      toggleCategory,
      toggleGroup,
      reorderCategories,
      moveCategoryToGroup,
      applyCategoryLayout,
      reorderGroups,
      renameGroup,
      createGroup,
      renameCategory,
      createCategory,
      colorCategory,
      setDefaultCategory,
      deleteCategory,
      restoreCategory,
      mergeCategory,
      setQuote,
      nextQuote,
      copyPlanToActual,
      reset,
      replaceData,
    }),
    [
      data,
      ready,
      syncStatus,
      syncConflict,
      resolveSyncConflict,
      undo,
      past.length,
      future.length,
      undoHistory,
      redoHistory,
      undoCommit,
      undoDelete,
      addBlock,
      addBlocks,
      createBlock,
      updateBlock,
      updateRecurringBlock,
      updateBlocks,
      deleteBlocks,
      deleteRecurringBlock,
      setBlockRecurrence,
      patchSettings,
      toggleCategory,
      toggleGroup,
      reorderCategories,
      moveCategoryToGroup,
      applyCategoryLayout,
      reorderGroups,
      renameGroup,
      createGroup,
      renameCategory,
      createCategory,
      colorCategory,
      setDefaultCategory,
      deleteCategory,
      restoreCategory,
      mergeCategory,
      setQuote,
      nextQuote,
      copyPlanToActual,
      reset,
      replaceData,
    ],
  );
}
