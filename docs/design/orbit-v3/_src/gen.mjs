import { write } from './lib.mjs';
import * as A from './genA.mjs';
import * as B from './genB.mjs';
import * as C from './genC.mjs';
import * as S from './genSys.mjs';
const only = process.argv[2] || '';
const jobs = [
  ['A-01-idle', A.a01], ['A-02-scramble', () => A.a02(false)], ['A-02b-wrong-turn', () => A.a02(true)], ['A-03-inspection', A.a03],
  ['A-04-solving', A.a04], ['A-05-results', A.a05], ['A-06-review', A.a06], ['A-07-history', A.a07], ['A-08-drill', A.a08], ['A-10-past-solve', A.a10], ['A-09-phone', A.a09], ['A-11-replay', () => A.a11()], ['A-12-phone-past', A.a12],
  ['B-01-idle', B.b01], ['B-02-scramble', () => B.b02(false)], ['B-02b-wrong-turn', () => B.b02(true)], ['B-03-inspection', B.b03], ['B-04-solving', B.b04], ['B-05-results', B.b05], ['B-06-review', B.b06], ['B-07-history', B.b07], ['B-08-drill', B.b08], ['B-09-phone', B.b09], ['B-10-past-solve', B.b10], ['B-11-replay', () => B.b11()], ['B-12-phone-past', B.b12],
  ['C-01-idle', C.c01], ['C-02-scramble', () => C.c02(false)], ['C-02b-wrong-turn', () => C.c02(true)], ['C-03-inspection', C.c03], ['C-04-solving', C.c04], ['C-05-results', C.c05], ['C-06-review', C.c06], ['C-07-history', C.c07], ['C-08-drill', C.c08], ['C-09-phone', C.c09], ['C-10-past-solve', C.c10], ['C-11-replay', () => C.c11()], ['C-12-phone-past', C.c12],
  ['00-system-components', S.sysComponents], ['00-system-pieces', S.sysPieces], ['00-system-flows', S.sysFlows], ['00-flow-storyboard', S.flowBoard],
];
for (const [n, fn] of jobs) if (n.startsWith(only)) write(n + '.svg', fn());
