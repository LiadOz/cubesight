import { test, expect } from 'playwright/test';

test.setTimeout(60_000);
async function openScout(page){
  await page.goto('/');
  await page.getByRole('link', { name: 'Cross Scout',exact:true}).click();
  await expect(page.locator('#scout-cube canvas')).toBeVisible();
}

test('color selection keeps the canonical preview until a plan is chosen',async({page})=>{
  await openScout(page);
  const canvas=page.locator('#scout-cube canvas');
  await expect(canvas).toHaveAttribute('data-bottom-face','D');
  await expect(canvas).toHaveAttribute('data-front-face','F');
  await expect(page.locator('#scout-bottom-label')).toHaveText('Default cube view');
  await expect(page.locator('#scout-front-reason')).toContainText('White stays on top, green in front, and red on the right');
  await expect(page.locator('#scout-front')).toBeDisabled();
  await page.locator('[data-scout-color="R"]').click();
  await expect(canvas).toHaveAttribute('data-bottom-face','D');
  await expect(canvas).toHaveAttribute('data-front-face','F');
  await expect(page.locator('#scout-view-caption')).toHaveText('White top · Green front · Red right');
  await expect(page.locator('#scout-message')).toContainText('stays white-top / green-front');
});

test('calculator analyzes, highlights pieces, and plays a verified plan',async({page})=>{
  await openScout(page);
  await page.locator('#scout-scramble').fill('R U F');
  await page.locator('#scout-analyze').click();
  await expect(page.locator('#scout-message')).toContainText('plans found',{timeout:30_000});
  expect(await page.locator('.scout-result').count()).toBeGreaterThan(0);
  await expect(page.locator('.scout-result[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('#scout-cube canvas')).toHaveAttribute('data-bottom-face','D');
  await expect(page.locator('#scout-cube canvas')).toHaveAttribute('data-front-face','F');
  await expect(page.locator('#scout-front')).toBeDisabled();
  const pairPlan=page.locator('.scout-result').filter({hasText:'solved F2L pair'}).first();
  await pairPlan.click();
  await expect(page.locator('#scout-front')).toBeEnabled();
  await expect(page.locator('#scout-front-reason')).toContainText(/because it shows \d of 4 cross-color stickers and \d of \d plan pieces/);
  const expectedMoves=await page.evaluate(async()=>{
    const {movesForInspection}=await import('/src/cross-cube.js');
    const root=document.querySelector('#scout-view'),canvas=document.querySelector('#scout-cube canvas');
    return movesForInspection(root.dataset.scoutCanonicalMoves,canvas.dataset.bottomFace,canvas.dataset.frontFace);
  });
  await expect(page.locator('.scout-move')).toHaveText(expectedMoves);
  const oldFront=await page.locator('#scout-front').inputValue();
  const newFront=await page.locator('#scout-front option').evaluateAll((options,current)=>options.map(option=>option.value).find(value=>value!==current),oldFront);
  await page.locator('#scout-front').selectOption(newFront);
  const remappedMoves=await page.evaluate(async()=>{
    const {movesForInspection}=await import('/src/cross-cube.js');
    const root=document.querySelector('#scout-view'),canvas=document.querySelector('#scout-cube canvas');
    return movesForInspection(root.dataset.scoutCanonicalMoves,canvas.dataset.bottomFace,canvas.dataset.frontFace);
  });
  await expect(page.locator('.scout-move')).toHaveText(remappedMoves);
  await expect(page.locator('#scout-message')).toContainText('remapped to this held view');
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

test('scout can tumble past its poles and has no corner timeout or scoring',async({page})=>{
  await openScout(page);
  const canvas=page.locator('#scout-cube canvas');
  await expect(canvas).toHaveAttribute('data-rotation','free-tumble');
  await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox();const before=await canvas.getAttribute('data-camera-pose');
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.8);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.05,{steps:12});await page.mouse.up();
  await page.waitForTimeout(250);
  expect(await canvas.getAttribute('data-camera-pose')).not.toBe(before);
  expect(await canvas.getAttribute('data-camera-up')).not.toBe('0.0000,1.0000,0.0000');
  await page.clock.install();
  await page.clock.fastForward(30_000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('.retention-panel')).toBeHidden();
  await page.getByRole('link', { name: 'Corner recognition',exact:true}).click();
  await expect(page.locator('#cube canvas')).toHaveAttribute('data-rotation','locked');
});

test('mobile can switch from page scrolling to unrestricted touch rotation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await page.goto('/#/cross-scout');
  const canvas=page.locator('#scout-cube canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-touch-mode','page-scroll');
  await page.locator('#scout-touch-mode').click();
  await expect(page.locator('#scout-touch-mode')).toHaveAttribute('aria-pressed','true');
  await expect(canvas).toHaveAttribute('data-touch-mode','full-rotation');
  await expect(canvas).toHaveCSS('touch-action','none');
  await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox(),x=box.x+box.width/2,start=box.y+box.height*.8,end=box.y+box.height*.05;
  const beforePose=await canvas.getAttribute('data-camera-pose'),beforeScroll=await page.evaluate(()=>scrollY);
  const session=await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
  for(let index=1;index<=12;index+=1)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*index/12}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(250);
  expect(await canvas.getAttribute('data-camera-pose')).not.toBe(beforePose);
  expect(await page.evaluate(()=>scrollY)).toBe(beforeScroll);
  await page.locator('#scout-touch-mode').click();
  await expect(canvas).toHaveCSS('touch-action','pan-y');
  await context.close();
});
