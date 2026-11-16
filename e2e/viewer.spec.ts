import { test, expect } from '@playwright/test';
test('Демо, выбор, скрытие, разборка, смещение, сброс и ведомость',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button',{name:'ОС-001 Щебёночное основание',exact:true}).click();
  await expect(page.getByTestId('element-volume')).toContainText('93,1');
  await page.getByRole('button',{name:'Скрыть',exact:true}).click();await expect(page.getByRole('button',{name:'Видимость ОС-001',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Разобрать',exact:true}).click();await expect(page.getByRole('button',{name:'Разобрать',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByLabel('Смещение X',{exact:true}).fill('5');await expect(page.getByTestId('element-volume')).toContainText('93,1');
  await page.getByRole('button',{name:'Сбросить перемещения',exact:true}).click();await expect(page.getByLabel('Смещение X',{exact:true})).toHaveValue('0');await expect(page.getByRole('button',{name:'Разобрать',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Ведомость материалов',exact:true}).click();await expect(page.getByTestId('total-volume')).toBeVisible();
  expect(errors).toEqual([]);
});
test('JSON сохраняется, открывается и валидируется; CSV и GLB экспортируются',async({page})=>{
  await page.goto('/');const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить',exact:true}).click();const file=await saved;const path=await file.path();expect(path).toBeTruthy();
  await page.getByLabel('Загрузить JSON',{exact:true}).setInputFiles(path!);await expect(page.getByRole('status')).toContainText('загружен');
  await page.getByLabel('Загрузить JSON',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});await expect(page.getByRole('status')).toContainText('Ошибка');await expect(page.locator('canvas')).toBeVisible();
  const csv=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();expect((await csv).suggestedFilename()).toBe('buildscope.csv');
  const glb=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт GLB'}).click();expect((await glb).suggestedFilename()).toBe('buildscope.glb');
});
test('Проекции, сечение, тема, изоляция и DXF',async({page})=>{
  await page.goto('/');for(const name of ['Сверху','Спереди','Сбоку','Изометрия','Перспектива','Разрез'])await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByLabel('Положение разреза')).toBeVisible();await page.getByLabel('Положение разреза').fill('5');await page.getByLabel('Сменить тему').click();await expect(page.locator('.app')).toHaveClass('app light');
  await page.getByRole('button',{name:'ОС-001 Щебёночное основание',exact:true}).click();await page.getByRole('button',{name:'Изолировать',exact:true}).click();await expect(page.getByRole('button',{name:'Изолировать',exact:true})).toHaveClass('active');
  const text='0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n5\n0\nENDSEC\n0\nEOF\n';
  await page.getByLabel('Загрузить DXF',{exact:true}).setInputFiles({name:'plan.dxf',mimeType:'application/dxf',buffer:Buffer.from(text)});await expect(page.getByLabel('Чертёж DXF',{exact:true})).toBeVisible();await expect(page.locator('.drawing aside')).toContainText('1 отрезков');
});
test('Визуальная проверка, выбор и измерение через WebGL',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForLoadState('networkidle');
  const canvas=page.locator('canvas');const bounds=await canvas.boundingBox();expect(bounds).toBeTruthy();
  // Select an actual rendered surface; projected model occupies the center of canvas.
  const box=bounds!;let picked=false;
  for(const [x,y] of [[.5,.5],[.55,.55],[.45,.55],[.5,.6],[.4,.6]]){await canvas.click({position:{x:box.width*x,y:box.height*y}});if(await page.getByTestId('element-volume').isVisible()){picked=true;break;}}
  expect(picked).toBe(true);
  await page.getByRole('button',{name:'Замер',exact:true}).click();
  for(const [x,y] of [[.5,.5],[.55,.55],[.45,.55],[.5,.6],[.4,.6]]){await canvas.click({position:{x:box.width*x,y:box.height*y}});if(await page.locator('.measure-label').isVisible())break;}
  await expect(page.locator('.measure-label')).toBeVisible();
  await page.getByRole('button',{name:'Замер',exact:true}).click();
  await page.screenshot({path:'test-results/buildscope-dark.png',fullPage:true});expect(errors).toEqual([]);
});
