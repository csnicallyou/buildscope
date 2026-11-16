import { z } from 'zod';

export const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const box = z.object({ size: vector.refine(v => v.every(n => n > 0), 'Размеры должны быть положительными'), offset: vector });
export const elementSchema = z.object({
  id: z.string().min(1), name: z.string(), mark: z.string(), category: z.string(), material: z.string(), color: z.string().regex(/^#[0-9a-f]{6}$/i),
  position: vector, parts: z.array(box).min(1).max(64), source: z.string(), confidence: z.enum(['drawing','computed','manual','assumed','unknown']),
  parentId: z.string().nullable().default(null), sourceRef: z.string().nullable().default(null),
});
export const projectSchema = z.object({ version: z.literal(1), name: z.string(), units: z.literal('m'), elements: z.array(elementSchema).max(10000) }).superRefine((p, ctx) => {
  const ids = new Set(p.elements.map(e => e.id));
  if (ids.size !== p.elements.length) ctx.addIssue({ code: 'custom', message: 'Повторяющийся ID' });
  let totalCells=0;
  for (const e of p.elements) {
    const cells=[0,1,2].map(a=>new Set(e.parts.flatMap(b=>[b.offset[a]-b.size[a]/2,b.offset[a]+b.size[a]/2])).size-1).reduce((a,b)=>a*b,1);
    totalCells+=cells;
    if(cells>250000)ctx.addIssue({code:'custom',message:'Слишком сложная геометрия элемента'});
    if (e.parentId && !ids.has(e.parentId)) ctx.addIssue({code:'custom', message:'Неизвестный родитель'});
    let parent = e.parentId; const visited = new Set([e.id]);
    while (parent) { if (visited.has(parent)) { ctx.addIssue({code:'custom',message:'Цикл связей'}); break; } visited.add(parent); parent = p.elements.find(x => x.id === parent)?.parentId ?? null; }
  }
  if(totalCells>2000000)ctx.addIssue({code:'custom',message:'Превышен расчётный бюджет проекта'});
});
export type Vec3 = z.infer<typeof vector>;
export type Element = z.infer<typeof elementSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Box = Element['parts'][number];

// Exact union of axis-aligned boxes: overlapping parts are counted once.
// Surface counts only exposed cell faces, including recesses and through openings.
export function quantities(parts: Box[]) {
  const axes = [0,1,2].map(a => [...new Set(parts.flatMap(p => [p.offset[a]-p.size[a]/2,p.offset[a]+p.size[a]/2]))].sort((a,b)=>a-b));
  if (axes.reduce((n,a)=>n*(a.length-1),1) > 250000) throw new Error('Слишком сложное составное тело');
  let volume = 0, area = 0; const cells = new Set<string>();
  const key = (i:number,j:number,k:number)=>`${i},${j},${k}`;
  for(let i=0;i<axes[0].length-1;i++) for(let j=0;j<axes[1].length-1;j++) for(let k=0;k<axes[2].length-1;k++) {
    const indices=[i,j,k]; const mid=indices.map((n,a)=>(axes[a][n]+axes[a][n+1])/2);
    if(parts.some(p=>mid.every((v,a)=>v>p.offset[a]-p.size[a]/2 && v<p.offset[a]+p.size[a]/2))) cells.add(key(i,j,k));
  }
  for(const cell of cells){const ijk=cell.split(',').map(Number); const d=ijk.map((n,a)=>axes[a][n+1]-axes[a][n]); volume+=d[0]*d[1]*d[2];
    for(let a=0;a<3;a++) for(const sign of [-1,1]) {const n=[...ijk];n[a]+=sign;if(!cells.has(key(n[0],n[1],n[2]))) area+=d[(a+1)%3]*d[(a+2)%3];}
  }
  return {volume, area};
}
export function totals(elements: Element[]) {return elements.reduce<Record<string,number>>((a,e)=>{a[e.material]=(a[e.material]??0)+quantities(e.parts).volume;return a;},{});}
const csvCell=(v:unknown)=>`"${String(v).replace(/"/g,'""').replace(/^[=+@-]/,"'$&")}"`;
export function toCSV(p:Project){return '\uFEFF'+[['ID','Марка','Наименование','Материал','Объем м3','Площадь м2','Количество','Источник','Достоверность'],...p.elements.map(e=>{const q=quantities(e.parts);return[e.id,e.mark,e.name,e.material,q.volume,q.area,1,e.source,e.confidence];})].map(r=>r.map(csvCell).join(';')).join('\r\n');}
export function parseProject(raw:string):Project {return projectSchema.parse(JSON.parse(raw));}

export function demo(length=36):Project {
  if(!Number.isFinite(length)||length<12||length>120||length%6!==0) throw new Error('Длина: 12–120 м с шагом 6 м');
  const elements:Element[]=[];
  const add=(name:string,category:string,material:string,color:string,size:Vec3,position:Vec3,parts?:Box[])=>{
    const id=`demo-${elements.length+1}`;
    elements.push({id,name,mark:`${category.slice(0,2).toUpperCase()}-${String(elements.length+1).padStart(3,'0')}`,category,material,color,position,parts:parts??[{size,offset:[0,0,0]}],source:'Параметрическая демонстрация · все размеры условные',confidence:'assumed',parentId:null,sourceRef:null});
  };
  add('Щебёночное основание','Основание','Щебень','#82908e',[length+2,.35,7],[0,-.65,0]);
  add('Бетонная подготовка','Основание','Бетон В7.5','#a2aaa6',[length+.6,.12,6.2],[0,-.415,0]);
  add('Ленточный фундамент лестницы','Фундаменты','Бетон В25','#94a8ab',[3.6,.4,2.4],[-length/2-1.6,-.2,0]);
  for(let x=-length/2+3;x<length/2;x+=6){
    for(const z of [-2.1,2.1]){
      add('Фундамент ступенчатый','Фундаменты','Бетон В25','#94a8ab',[1.6,.6,1.6],[x,-.08,z],[{size:[1.6,.3,1.6],offset:[0,-.15,0]},{size:[.9,.3,.9],offset:[0,.15,0]}]);
      add('Опора платформы','Опоры','Бетон В30','#aababc',[.45,1,.45],[x,.7,z]);
    }
    add('Поперечная балка','Балки','Бетон В30','#a4b7b9',[.4,.4,5.6],[x,1.25,0]);
    for(let s=0;s<3;s++)add('Плита платформы','Плиты','Бетон В30','#c2ccc8',[1.96,.22,5.8],[x-2+s*2,1.56,0]);
    add('Покрытие платформы','Покрытие','Асфальтобетон','#647b7b',[5.98,.08,5.8],[x,1.71,0]);
    add('Колонна навеса','Навес','Сталь','#528c8f',[.18,3.2,.18],[x,3.35,0]);
    add('Кровля навеса','Навес','Сталь','#86b5b4',[5.96,.12,4.8],[x,5,0]);
  }
  const steps:Box[]=Array.from({length:8},(_,i)=>({size:[.4,(i+1)*.22,2],offset:[i*.4,(i+1)*.11,0]}));
  add('Лестничный сход','Лестницы','Бетон В30','#b3c2bf',[3.2,1.76,2],[-length/2-3,0,0],steps);
  for(const z of [-5,5]){
    add('Балласт пути','Пути','Щебень','#677a79',[length+12,.3,2.8],[0,-.5,z]);
    for(const dz of [-.76,.76])add('Условный рельс','Пути','Сталь','#789294',[length+12,.16,.08],[0,-.08,z+dz]);
    for(let x=-length/2-5;x<length/2+6;x+=.8)add('Шпала','Пути','Бетон В40','#8b9690',[.22,.18,2.4],[x,-.25,z]);
  }
  return {version:1,name:'Платформа «Северная»',units:'m',elements};
}
