import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, OrthographicCamera, GizmoHelper, GizmoViewport, Line, Html, Edges } from '@react-three/drei';
import { Plane, Vector3 } from 'three';
import type { OrbitControls as Controls } from 'three-stdlib';
import { useStore, displayPosition } from './store';
import type { Element } from './model';
const layers=['Основание','Фундаменты','Опоры','Балки','Плиты','Покрытие','Лестницы','Навес','Пути'];
function Camera(){
  const {view,ortho,project}=useStore();const controls=useRef<Controls>(null);const {camera,size}=useThree();
  useEffect(()=>{const length=Math.max(36,...project.elements.flatMap(e=>e.parts.map(p=>Math.abs(e.position[0])+p.size[0]/2)))*1.4;
    const positions={iso:[length*.75,length*.55,length*.72],top:[0,length,0.001],front:[0,2,length],side:[length,2,0]};
    camera.position.set(...positions[view] as [number,number,number]);camera.up.set(0,1,0);camera.lookAt(0,1,0);
    if('isOrthographicCamera' in camera){(camera as import('three').OrthographicCamera).zoom=Math.min(size.width,size.height)/length;camera.updateProjectionMatrix();}
    controls.current?.target.set(0,1,0);controls.current?.update();
  },[view,ortho,camera,project,size]);
  return <OrbitControls ref={controls} makeDefault minDistance={2} maxDistance={5000}/>;
}
function Part({element:e}:{element:Element}){
  const s=useStore();const pos=displayPosition(e.position,s.offsets[e.id],s.exploded,layers.indexOf(e.category));
  const planes=useMemo(()=>s.section?[new Plane(new Vector3(-1,0,0),s.cut)]:[],[s.section,s.cut]);
  if(s.hidden.includes(e.id)||(s.isolated&&s.isolated!==e.id))return null;
  function click(event:ThreeEvent<MouseEvent>){if(s.section&&event.point.x>s.cut)return;event.stopPropagation();if(s.measure){const p=event.point;s.set({points:[...(s.points.length===2?[]:s.points),[p.x,p.y,p.z]]});}else s.set({selected:e.id});}
  return <group position={pos}>{e.parts.map((p,i)=><mesh key={i} position={p.offset} onClick={click} userData={{id:e.id}}>
    <boxGeometry args={p.size}/><meshStandardMaterial color={s.selected===e.id?'#f4b85d':e.color} roughness={.82} metalness={e.material==='Сталь'?.35:0} transparent={s.opacity<1} opacity={s.opacity} wireframe={s.wire} clippingPlanes={planes}/>
    {!s.section&&!s.wire&&<Edges threshold={20} color={s.selected===e.id?'#fff0c5':'#3e5558'}/>}
  </mesh>)}</group>;
}
function Scene(){const s=useStore();return <>
  {s.ortho?<OrthographicCamera makeDefault position={[35,28,35]} near={.01} far={10000}/>:<PerspectiveCamera makeDefault fov={42} position={[35,28,35]} near={.01} far={10000}/>}
  <Camera/><ambientLight intensity={1.7}/><directionalLight position={[10,25,8]} intensity={2.4}/>
  <gridHelper args={[160,80,s.theme==='dark'?'#38525c':'#b0c2c6',s.theme==='dark'?'#243a44':'#d2dfe0']} position={[0,-.85,0]}/>
  {s.project.elements.map(e=><Part key={e.id} element={e}/>)}
  {s.points.map((p,i)=><mesh key={i} position={p}><sphereGeometry args={[.12,12,12]}/><meshBasicMaterial color="#ffbe59"/></mesh>)}
  {s.points.length===2&&<><Line points={s.points} color="#ffbe59" lineWidth={2}/><Html position={s.points[1]}><span className="measure-label">{new Vector3(...s.points[0]).distanceTo(new Vector3(...s.points[1])).toFixed(3)} м</span></Html></>}
  <GizmoHelper alignment="bottom-right" margin={[65,65]}><GizmoViewport axisColors={['#c97b72','#88b491','#77a6d1']} labelColor="white"/></GizmoHelper>
  </>;}
export default function Viewer(){const theme=useStore(s=>s.theme);return <Canvas gl={{antialias:true,localClippingEnabled:true,preserveDrawingBuffer:true}} dpr={[1,2]} style={{background:theme==='dark'?'#142832':'#e5edef'}} onPointerMissed={()=>useStore.getState().set({selected:null})}><Scene/></Canvas>;}
