import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const launcher=readFileSync('components/intake/IntakeLauncher.tsx','utf8');
const library=readFileSync('app/psychometrics/page.tsx','utf8');
const blankPage=readFileSync('app/intake/blank/page.tsx','utf8');
test('library already specifies tool and delivery channel, so the quick form does not repeat those steps',()=>{
 assert.match(library,/lockTools/);
 assert.match(library,/initialChannel=\{launcherRequest.channel\}/);
 assert.match(launcher,/const quickCompact=lockTools&&!fixed;/);
 assert.match(launcher,/quickCompact\?<section/);
 assert.match(launcher,/quickMatches\.map/);
 assert.match(launcher,/chooseQuickNew/);
 assert.match(launcher,/t\('history.quickEmailTitle'/);
 assert.match(launcher,/t\('history.quickTabletTitle'/);
});
test('quick sends still delegate to the existing intake assignment service without creating a patient early',()=>{
 assert.match(launcher,/const provisional_identity=isNew\?/);
 assert.match(launcher,/action:'assign'/);
 assert.match(launcher,/recipient_locale:recipientLocale/);
 assert.match(launcher,/action:.*assign/);
});
test('print from the library opens an unlinked blank form directly without creating an assignment',()=>{
 assert.match(library,/if\(channel==='print'\)/);
 assert.match(library,/\/intake\/blank\?tool=/);
 assert.match(blankPage,/\['history','PHQ-9','GAD-7'\]/);
 assert.match(blankPage,/BlankPrint/);
 const content=readFileSync('app/intake/blank/BlankPrint.tsx','utf8');
 assert.match(content,/id:'blank'/);
 assert.match(content,/window\.print\(\)/);
});
