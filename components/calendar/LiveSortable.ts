'use client'
import type { CSSProperties } from 'react'
import { KeyboardSensor, PointerSensor, closestCenter, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function useLiveSortable(input:string|{id:string}){const id=typeof input==='string'?input:input.id,sortable=useSortable({id}),{setNodeRef,transform,transition,isDragging}=sortable,liveTransform=transform?{...transform,x:0,scaleX:1,scaleY:1}:null,attributes={...sortable.attributes,'data-live-sortable':'','data-live-dragging':isDragging||undefined} as Omit<typeof sortable.attributes,'role'>;return{...sortable,transform:liveTransform,attributes,rootProps:{ref:setNodeRef,style:{transform:CSS.Transform.toString(liveTransform),transition} as CSSProperties}}}
export function useLiveSortableSensors(){return useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}))}
export function liveSortableHits(args:Parameters<typeof pointerWithin>[0]){const pointer=pointerWithin(args);if(pointer.length)return pointer;const intersections=rectIntersection(args);return intersections.length?intersections:closestCenter(args)}
