import test from "node:test";
import assert from "node:assert/strict";
import { parsePdfZoom, pdfZoomPercent, wheelPdfScale, bindPdfZoom } from "../src/lib/pdfZoom.js";

class Surface extends EventTarget {
  clientHeight = 500; offsetLeft = 5; offsetTop = 10;
  scrollLeft = 0; scrollTop = 0;
  getBoundingClientRect() { return {left:200,top:150,width:600,height:500}; }
  closest() { return null; }
}
const fire = (surface, name, values = {}) => {
  const event = Object.assign(new Event(name, {cancelable:true}), values);
  surface.dispatchEvent(event); return event;
};
function setup() {
  const surface = new Surface(); let enabled = true, changes = 0;
  const viewer = { container:surface, currentScale:0.4, lastOptions:null,
    updateScale(options) { this.lastOptions=options; this.currentScale=Math.max(0.1,Math.min(10,Math.round(this.currentScale*options.scaleFactor*100)/100)); },
    increaseScale() {this.currentScale*=1.1;}, decreaseScale(){this.currentScale/=1.1;}, update(){} };
  const dispose=bindPdfZoom(surface,{viewer,enabled:()=>enabled,onZoom:()=>changes++});
  return {surface,viewer,dispose,setEnabled:value=>{enabled=value;},get changes(){return changes;}};
}

test("manual percentages retain decimals, clamp to bookmark bounds and reject invalid values",()=>{
  assert.equal(parsePdfZoom('40'),0.4); assert.equal(parsePdfZoom('40.5%'),0.405);
  assert.equal(parsePdfZoom('40,5'),0.405); assert.equal(pdfZoomPercent(0.405),40.5);
  assert.equal(parsePdfZoom('0'),0.1);assert.equal(parsePdfZoom('10000'),10);
  for(const value of ['', 'nope', 'Infinity'])assert.equal(parsePdfZoom(value,0.4),0.4);
  assert.ok(wheelPdfScale(1,-100)>1);assert.ok(wheelPdfScale(1,100)<1);
  assert.equal(wheelPdfScale(1,2,1),wheelPdfScale(1,32,0));
});
test("modifier wheel zoom stays local, anchors under the cursor and accumulates tiny pinch deltas",()=>{
  const a=setup();
  assert.equal(fire(a.surface,'wheel',{deltaY:100,ctrlKey:false}).defaultPrevented,false);
  assert.equal(a.viewer.currentScale,0.4);
  for(let i=0;i<12;i++)assert.equal(fire(a.surface,'wheel',{deltaY:-1,deltaMode:0,ctrlKey:true,clientX:350,clientY:300}).defaultPrevented,true);
  assert.ok(a.viewer.currentScale>0.4);
  assert.deepEqual(a.viewer.lastOptions.origin,[155,160]);
  const before=a.viewer.currentScale;a.setEnabled(false);
  fire(a.surface,'wheel',{deltaY:-100,ctrlKey:true,clientX:350,clientY:300});assert.equal(a.viewer.currentScale,before);
  a.dispose();assert.equal(fire(a.surface,'wheel',{deltaY:-100,ctrlKey:true}).defaultPrevented,false);
});
test("touch and Safari pinches adjust PDF scale; keyboard shortcuts work only inside the reader",()=>{
  const a=setup();
  const touches=distance=>[{clientX:300-distance/2,clientY:300},{clientX:300+distance/2,clientY:300}];
  fire(a.surface,'touchstart',{touches:touches(100)});fire(a.surface,'touchmove',{touches:touches(150)});
  assert.equal(a.viewer.currentScale,0.6);fire(a.surface,'touchend',{touches:[]});
  fire(a.surface,'gesturestart',{scale:1});fire(a.surface,'gesturechange',{scale:2,clientX:300,clientY:300});
  assert.equal(a.viewer.currentScale,1.2);fire(a.surface,'gestureend');
  const plain=fire(a.surface,'keydown',{key:'+',ctrlKey:false});assert.equal(plain.defaultPrevented,false);
  fire(a.surface,'keydown',{key:'+',ctrlKey:true});assert.ok(a.viewer.currentScale>1.2);
  fire(a.surface,'keydown',{key:'0',metaKey:true});assert.equal(a.viewer.currentScale,1);
  a.dispose();
});
