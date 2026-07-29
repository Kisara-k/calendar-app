const fs=require('node:fs')
const path=require('node:path')
const test=require('node:test')
const assert=require('node:assert/strict')

test('simple calendar dropdowns use the shared themed component instead of native selects',()=>{const componentDir=path.resolve(__dirname,'../components/calendar'),componentSources=fs.readdirSync(componentDir).filter(file=>file.endsWith('.tsx')).map(file=>fs.readFileSync(path.join(componentDir,file),'utf8')),dropdown=fs.readFileSync(path.join(componentDir,'CalendarDropdown.tsx'),'utf8');assert.ok(componentSources.every(source=>!source.includes('<select')));assert.ok(dropdown.includes('role="listbox"')&&dropdown.includes('role="option"'));assert.ok(dropdown.includes("event.key==='ArrowDown'")&&dropdown.includes("event.key==='Escape'"))})

test('edit surfaces share the root theme token and selected outcomes can be cleared',()=>{const css=fs.readFileSync(path.resolve(__dirname,'../app/globals.css'),'utf8'),inspector=fs.readFileSync(path.resolve(__dirname,'../components/calendar/EventInspector.tsx'),'utf8'),lines=css.split(/\r?\n/),darkRoot=lines[0],lightRoot=lines.find(line=>line.startsWith('html[data-theme=light]{'));assert.ok(darkRoot.includes('--edit-box-bg:#ffffff03'));assert.ok(lightRoot?.includes('--edit-box-bg:#26313803'));assert.equal((css.match(/:root\{--edit-box-bg/g)||[]).length,0);assert.ok(css.includes('.calendar-dropdown-trigger,.status-grid button:not(.active)'));assert.ok(inspector.includes('status:block.status===s?undefined:s'));assert.ok(inspector.includes('aria-pressed={block.status===s}'))})
