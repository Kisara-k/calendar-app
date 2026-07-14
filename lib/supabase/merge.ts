import type { DatabaseSnapshot } from './database'
import { same } from './rows'

export type MergeResult={snapshot:DatabaseSnapshot;conflicts:string[]}

const plainObject=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)
const clone=<T>(value:T):T=>value===undefined?value:structuredClone(value)

function mergeValue(base:unknown,local:unknown,remote:unknown,path:string,conflicts:string[]):unknown{
  if(same(local,remote))return clone(local)
  if(same(local,base))return clone(remote)
  if(same(remote,base))return clone(local)
  if(plainObject(base)&&plainObject(local)&&plainObject(remote)){
    const merged:Record<string,unknown>={},keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])
    for(const key of Array.from(keys)){const value=mergeValue(base[key],local[key],remote[key],`${path}.${key}`,conflicts);if(value!==undefined)merged[key]=value}
    return merged
  }
  conflicts.push(path)
  return clone(local)
}

function mergeRows<T extends{id:string}>(base:T[],local:T[],remote:T[],path:string,conflicts:string[]):T[]{
  const baseById=new Map(base.map(item=>[item.id,item])),localById=new Map(local.map(item=>[item.id,item])),remoteById=new Map(remote.map(item=>[item.id,item])),ids=new Set([...remote.map(item=>item.id),...local.map(item=>item.id),...base.map(item=>item.id)]),result:T[]=[]
  for(const id of Array.from(ids)){const merged=mergeValue(baseById.get(id),localById.get(id),remoteById.get(id),`${path}.${id}`,conflicts);if(merged!==undefined)result.push(merged as T)}
  return result
}

export function mergeSnapshots(base:DatabaseSnapshot,local:DatabaseSnapshot,remote:DatabaseSnapshot):MergeResult{
  const conflicts:string[]=[]
  return{snapshot:{revision:remote.revision,account:mergeValue(base.account,local.account,remote.account,'account',conflicts) as DatabaseSnapshot['account'],groups:mergeRows(base.groups,local.groups,remote.groups,'groups',conflicts),calendars:mergeRows(base.calendars,local.calendars,remote.calendars,'calendars',conflicts),series:mergeRows(base.series,local.series,remote.series,'series',conflicts),blocks:mergeRows(base.blocks,local.blocks,remote.blocks,'blocks',conflicts),blockNotes:mergeRows(base.blockNotes??[],local.blockNotes??[],remote.blockNotes??[],'blockNotes',conflicts)},conflicts}
}
