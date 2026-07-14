import type { DatabaseSnapshot } from './database'
import type { CalendarData } from '@/lib/calendar/types'

type CachedWorkspace={userId:string;version:1;snapshot:DatabaseSnapshot;updatedAt:number}
export type OutboxRecord={id:string;userId:string;clientId:string;base:DatabaseSnapshot;pending:CalendarData;mutationId:string|null;mutationTarget:CalendarData|null;updatedAt:number;leaseUntil:number}

const DATABASE='calendar-cache'
const SNAPSHOTS='snapshots'
const OUTBOX='outbox'

const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error)})
const complete=(transaction:IDBTransaction)=>new Promise<void>((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)})

function openDatabase(){return new Promise<IDBDatabase>((resolve,reject)=>{const pending=indexedDB.open(DATABASE,2);pending.onupgradeneeded=()=>{if(!pending.result.objectStoreNames.contains(SNAPSHOTS))pending.result.createObjectStore(SNAPSHOTS,{keyPath:'userId'});if(!pending.result.objectStoreNames.contains(OUTBOX)){const store=pending.result.createObjectStore(OUTBOX,{keyPath:'id'});store.createIndex('userId','userId')}};pending.onsuccess=()=>resolve(pending.result);pending.onerror=()=>reject(pending.error)})}

export async function getCachedSnapshot(userId:string){const database=await openDatabase(),transaction=database.transaction(SNAPSHOTS,'readonly'),record=await request(transaction.objectStore(SNAPSHOTS).get(userId)) as CachedWorkspace|undefined;database.close();return record?.version===1?record.snapshot:null}

export async function putCachedSnapshot(userId:string,snapshot:DatabaseSnapshot){const database=await openDatabase(),transaction=database.transaction(SNAPSHOTS,'readwrite');transaction.objectStore(SNAPSHOTS).put({userId,version:1,snapshot,updatedAt:Date.now()} satisfies CachedWorkspace);await complete(transaction);database.close()}

export async function listOutboxRecords(userId:string){const database=await openDatabase(),transaction=database.transaction(OUTBOX,'readonly'),records=await request(transaction.objectStore(OUTBOX).index('userId').getAll(userId)) as OutboxRecord[];database.close();return records}

export async function putOutboxRecord(record:OutboxRecord){const database=await openDatabase(),transaction=database.transaction(OUTBOX,'readwrite');transaction.objectStore(OUTBOX).put(record);await complete(transaction);database.close()}

export async function deleteOutboxRecords(ids:string[]){if(!ids.length)return;const database=await openDatabase(),transaction=database.transaction(OUTBOX,'readwrite'),store=transaction.objectStore(OUTBOX);ids.forEach(id=>store.delete(id));await complete(transaction);database.close()}
