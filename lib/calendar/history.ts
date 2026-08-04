export type SnapshotHistory<T>={past:T[];future:T[]}

export function emptySnapshotHistory<T>():SnapshotHistory<T>{return{past:[],future:[]}}
export function recordSnapshot<T>(history:SnapshotHistory<T>,current:T,limit:number):SnapshotHistory<T>{return{past:[...history.past.slice(-(limit-1)),structuredClone(current)],future:[]}}
export function undoSnapshot<T>(history:SnapshotHistory<T>,current:T,limit:number){if(!history.past.length)return null;const previous=history.past[history.past.length-1];return{current:previous,history:{past:history.past.slice(0,-1),future:[structuredClone(current),...history.future].slice(0,limit)}}}
export function redoSnapshot<T>(history:SnapshotHistory<T>,current:T,limit:number){if(!history.future.length)return null;const next=history.future[0];return{current:next,history:{past:[...history.past,structuredClone(current)].slice(-limit),future:history.future.slice(1)}}}
