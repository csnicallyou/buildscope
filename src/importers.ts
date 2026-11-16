import DxfParser from 'dxf-parser';
import type { Vec3 } from './model';
// Drawing import deliberately produces 2D linework, never invented solids.
export type Drawing={name:string;segments:[Vec3,Vec3][];warnings:string[];units:string};
export interface DrawingImporter {extensions:string[];parse:(text:string,name:string)=>Drawing;}
export const dxfImporter:DrawingImporter={extensions:['dxf'],parse(text,name){
  const data=new DxfParser().parseSync(text);if(!data)throw new Error('DXF не прочитан');
  const segments:[Vec3,Vec3][]=[];let skipped=0;
  for(const e of data.entities){
    if(e.type==='LINE'||e.type==='LWPOLYLINE'||e.type==='POLYLINE'){
      const entity=e as unknown as {vertices:{x:number;y:number;z?:number;bulge?:number}[];shape?:boolean};
      if(!entity.vertices||entity.vertices.some(v=>v.bulge)){skipped++;continue;}
      const v=entity.vertices.map(p=>[p.x,p.y,p.z??0] as Vec3);
      for(let i=1;i<v.length;i++)segments.push([v[i-1],v[i]]);
      if(entity.shape&&v.length>2)segments.push([v[v.length-1],v[0]]);
    }else skipped++;
    if(segments.length>50000)throw new Error('DXF превышает лимит 50 000 отрезков');
  }
  if(!segments.length)throw new Error('Нет поддерживаемых LINE / POLYLINE без дуг');
  if(segments.some(s=>s.some(p=>p.some(v=>!Number.isFinite(v)))))throw new Error('Недопустимые координаты DXF');
  return{name,segments,warnings:[`${skipped} неподдерживаемых сущностей пропущено.`, 'Импортирован чертёж. Реконструкция 3D не выполнялась.'],units:String(data.header?.$INSUNITS??'не заданы')};
}};
export const importers:DrawingImporter[]=[dxfImporter];
