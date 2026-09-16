import { test, expect } from 'playwright/test';

test.setTimeout(60_000);
async function openScout(page){
  await page.goto('/');
  await page.getByRole('link', { name: 'Cross Scout',exact:true}).click();
  await expect(page.locator('#scout-cube canvas')).toBeVisible();
}

test('color selection holds that cross on bottom and offers a suggested, changeable front',async({page})=>{
  await openScout(page);
  const canvas=page.locator('#scout-cube canvas');
  await expect(canvas).toHaveAttribute('data-bottom-face','U');
  await expect(page.locator('#scout-bottom-label')).toHaveText('White on bottom');
  await expect(page.locator('#scout-front-reason')).toContainText(/suggested/i);
  await page.locator('[data-scout-color="R"]').click();
  await expect(canvas).toHaveAttribute('data-bottom-face','R');
  await expect(page.locator('#scout-bottom-label')).toHaveText('Red on bottom');
  await expect(page.locator('#scout-front option')).toHaveCount(4);
  await page.locator('#scout-front').selectOption('D');
  await expect(canvas).toHaveAttribute('data-front-face','D');
  await expect(page.locator('#scout-view-caption')).toContainText('Red bottom · Yellow front');
  await expect(page.locator('#scout-message')).toContainText('original white-U / green-F frame');
});

test('calculator analyzes, highlights pieces, and plays a verified plan',async({page})=>{
  await openScout(page);
  await page.locator('#scout-scramble').fill('R U F');
  await page.locator('#scout-analyze').click();
  await expect(page.locator('#scout-message')).toContainText('plans found',{timeout:30_000});
  expect(await page.locator('.scout-result').count()).toBeGreaterThan(0);
  const pairPlan=page.locator('.scout-result').filter({hasText:'solved F2L pair'}).first();
  await pairPlan.click();
  await expect(page.locator('#scout-cube canvas')).not.toHaveAttribute('aria-label',/Highlighted pieces/);
  await page.getByRole('button',{name:'Highlight cross and F2L pieces'}).click();
  expect(Number(await page.locator('#scout-cube canvas').getAttribute('data-highlight-cages'))).toBeGreaterThanOrEqual(6);
  await expect(page.locator('#scout-cube canvas')).toHaveAttribute('aria-label',/Highlighted pieces/);
  await page.locator('#scout-play').click();
  await expect(page.locator('#scout-step')).toContainText('plan complete',{timeout:15_000});
  await expect(page.locator('#scout-cube canvas')).toHaveAttribute('aria-label',/Highlighted pieces/);
  await page.getByRole('button',{name:'Highlight cross and F2L pieces'}).click();
  await expect(page.locator('#scout-cube canvas')).toHaveAttribute('data-highlight-cages','0');
  await expect(page.locator('#scout-cube canvas')).not.toHaveAttribute('aria-label',/Highlighted pieces/);
  await page.locator('#scout-start').click();
  await expect(page.locator('#scout-step')).toContainText('Move 0');
  await expect(page.locator('#scout-results')).not.toContainText('verified on the cube');
  await expect(page.locator('.scout-result').first()).toContainText('Look for:');
  await page.getByText('What do the solution classes mean?',{exact:true}).click();
  await expect(page.locator('.scout-guide')).toContainText('cross + two F2L pairs');
  await expect(page.locator('.scout-guide')).toContainText('not different solving methods');
});

test('selected plans support retrieval-first practice before revealing cues',async({page})=>{
  await openScout(page);
  await page.locator('#scout-scramble').fill('R U F');
  await page.locator('#scout-analyze').click();
  await expect(page.locator('#scout-message')).toContainText('plans found',{timeout:30_000});
  await page.locator('.scout-result').first().click();
  await expect(page.locator('#scout-practice')).toBeVisible();
  await page.locator('#scout-practice').click();
  await expect(page.locator('#scout-practice-panel')).toBeVisible();
  await expect(page.locator('.scout-results')).toBeHidden();
  await expect(page.locator('#scout-moves')).toBeEmpty();
  await expect(page.locator('#scout-cube canvas')).toHaveAttribute('data-highlight-cages','0');
  await page.locator('#scout-practice-reveal').click();
  await expect(page.locator('#scout-practice-time')).toContainText('Commitment time:');
  await expect(page.locator('#scout-practice-cue')).not.toBeEmpty();
  expect(Number(await page.locator('#scout-cube canvas').getAttribute('data-highlight-cages'))).toBeGreaterThanOrEqual(4);
  await page.getByRole('button',{name:'Found it'}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-scout-practice-v1')).at(-1).rating)).toBe('found');
  await expect(page.getByRole('button',{name:'Found it'})).toBeDisabled();
  await page.locator('#scout-practice-exit').click();
  await expect(page.locator('#scout-practice-panel')).toBeHidden();
});

test('upstream engine solutions validate independently for all six faces and both extended goals',async({page})=>{
  await openScout(page);
  const verified=await page.evaluate(async()=>{
    const {solveCross,terminateCrossSolver}=await import('/src/cross-solver.js');
    const {stateFromScramble,validateSolution}=await import('/src/cross-cube.js');
    const scramble="R U F L' D";const state=stateFromScramble(scramble),checks=[];
    for(const face of ['U','D','F','B','R','L']) for(const kind of ['cross','xcross','xxcross']){
      const reply=await solveCross({scramble,face,kind,maxResults:1,timeLimitMs:2000});
      checks.push({face,kind,count:reply.results.length,valid:reply.results.every(r=>{
        const result=validateSolution(state,r.moves,face);
        return result.crossSolved&&result.pairs.length>=({cross:0,xcross:1,xxcross:2}[kind]);
      })});
    }
    terminateCrossSolver();return checks;
  });
  for(const check of verified){expect(check.valid,JSON.stringify(check)).toBe(true);expect(check.count,JSON.stringify(check)).toBeGreaterThan(0);}
});

test('color subsets, CN, invalid scrambles, and cancellation remain usable on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});await openScout(page);
  await page.locator('[data-scout-color="CN"]').click();
  await expect(page.locator('[data-scout-color="CN"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-scout-color="F"]').click();
  await page.locator('[data-scout-color="B"]').click();
  await expect(page.locator('[data-scout-color="F"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-scout-color="B"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#scout-scramble').fill('R3');
  await expect(page.locator('#scout-message')).toContainText('Unsupported move');
  await expect(page.locator('#scout-cube canvas')).toBeHidden();
  await page.locator('#scout-random').click();
  await expect(page.locator('#scout-cube canvas')).toBeVisible();
  await page.locator('#scout-analyze').click();
  await page.locator('#scout-stop').click();
  await expect(page.locator('#scout-message')).toContainText('Search stopped');
  await expect(page.locator('#scout-analyze')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('scout has free rotation and no corner timeout or scoring',async({page})=>{
  await page.clock.install();await openScout(page);
  const canvas=page.locator('#scout-cube canvas');
  await expect(canvas).toHaveAttribute('data-rotation','free-all-axis');
  const box=await canvas.boundingBox();const before=await canvas.getAttribute('data-camera-pose');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+150,box.y+box.height/2+100,{steps:8});await page.mouse.up();
  expect(await canvas.getAttribute('data-camera-pose')).not.toBe(before);
  await page.clock.fastForward(30_000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('.retention-panel')).toBeHidden();
  await page.getByRole('link', { name: 'Corner recognition',exact:true}).click();
  await expect(page.locator('#cube canvas')).toHaveAttribute('data-rotation','locked');
});
