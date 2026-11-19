import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const smooth=t=>t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;
const css=(v)=>getComputedStyle(document.documentElement).getPropertyValue(v);
let view, renderer, scene, camera, clock, surface, cardPivot, cardSheet, frontFace, backFace, handRoot, handContainer, sleeve, cuff, shadow, piles={}, layout={}, composer;
let words={front:"",back:"",number:1};
let flipBack=false, flipTask=null, flyTask=null, springTask=null, firstFrame=false, initialized=false, handBones={};
let draggedX=0,draggedY=0,dragging=false;
let cardWidth=2.8,cardLength=3.75;
const rig=new THREE.Group();
const papers=[];
const color=new THREE.Color();
const p3=new THREE.Vector3(),q3=new THREE.Quaternion(),s3=new THREE.Vector3();

function createTexture(kind,text,serial){
  const c=document.createElement('canvas');c.width=768;c.height=1034;
  const g=c.getContext('2d');
  const warm=kind==="front",bg=warm?"#f8f1df":"#eee4d0",ink=warm?"#285443":"#9b694e";
  g.fillStyle=bg;g.fillRect(0,0,768,1034);
  const gr=g.createLinearGradient(0,0,768,1034);
  gr.addColorStop(0,"#fffdf1");gr.addColorStop(.55,bg);gr.addColorStop(1,"#e6dec9");g.fillStyle=gr;g.fillRect(0,0,768,1034);
  // Paper fibers; deterministic across re-renders.
  for(let i=0;i<3300;i++){
    const x=(i*73.71)%768,y=(i*177.43)%1034;
    g.fillStyle=(i%3)===0?"#7b6e5530":"#fffef137";
    g.fillRect(x,y,1,1);
  }
  g.lineWidth=3;g.strokeStyle="#b4a27d70";g.strokeRect(18,18,732,998);
  g.lineWidth=1.5;g.strokeStyle="#c7b79460";g.strokeRect(31,31,706,972);
  g.fillStyle="#3c7963";g.font="700 23px Arial, sans-serif";g.letterSpacing="3px";g.textAlign="left";
  g.fillText(warm?"E S P A Ñ O L":"E N G L I S H",66,106);
  g.textAlign="right";g.fillStyle="#ad9b7c";g.font="24px Arial, sans-serif";
  g.fillText("Nº "+String(serial).padStart(4,"0"),700,106);
  g.beginPath();g.moveTo(66,134);g.lineTo(700,134);g.strokeStyle="#c9b99a90";g.stroke();
  g.textAlign="center";g.fillStyle="#ac9272";g.font="700 20px Arial, sans-serif";
  g.fillText(warm?"S Ł O W O":"Z N A C Z E N I E",384,405);
  g.beginPath();g.moveTo(309,434);g.lineTo(459,434);g.lineWidth=2;g.strokeStyle="#b3a68b";g.stroke();
  g.fillStyle=ink;
  let size=text.length>24?57:text.length>17?70:text.length>11?90:text.length>7?119:147;
  g.font='600 '+size+'px "Fraunces", Georgia, serif';
  while(g.measureText(text).width>650&&size>35){size-=3;g.font='600 '+size+'px "Fraunces", Georgia, serif';}
  g.fillText(text,384,583,674);
  g.fillStyle="#bea581";g.font="48px Georgia, serif";g.fillText("✳",384,679);
  g.beginPath();g.moveTo(66,918);g.lineTo(700,918);g.lineWidth=2;g.strokeStyle="#d0bfa1";g.stroke();
  g.textAlign="left";g.fillStyle="#9f907b";g.font="700 18px Arial, sans-serif";
  g.fillText(warm?"DOTKNIJ, ABY ODKRYĆ ZNACZENIE":"PRZESUŃ NA WYBRANĄ KUPKĘ",66,965);
  g.textAlign="right";g.font="38px Georgia,serif";g.fillText("↻",702,973);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  return tex;
}
function buildCard(){
  cardPivot=new THREE.Group();
  cardSheet=new THREE.Group();
  cardPivot.add(cardSheet);
  cardSheet.rotation.x=-Math.PI/2;
  const core=new THREE.Mesh(new THREE.BoxGeometry(1,.01,1),new THREE.MeshStandardMaterial({color:0xe4d6bc,roughness:1}));
  core.rotation.x=Math.PI/2; // plane thickness along local Z
  cardSheet.add(core);
  const frontGeo=new THREE.PlaneGeometry(1,1);
  frontFace=new THREE.Mesh(frontGeo,new THREE.MeshStandardMaterial({map:createTexture("front","como",1),roughness:.94,side:THREE.FrontSide}));
  backFace=new THREE.Mesh(frontGeo.clone(),new THREE.MeshStandardMaterial({map:createTexture("back","as",1),roughness:.94,side:THREE.FrontSide}));
  frontFace.position.z=.015;
  backFace.position.z=-.015;
  backFace.rotation.y=Math.PI;
  frontFace.castShadow=backFace.castShadow=true;
  frontFace.receiveShadow=backFace.receiveShadow=true;
  cardSheet.add(frontFace,backFace);
  const rim=new THREE.Mesh(new THREE.BoxGeometry(1,1,.026),new THREE.MeshStandardMaterial({color:0xf7ecd6,roughness:.95}));
  rim.receiveShadow=true;rim.castShadow=true;cardSheet.add(rim);rim.position.z=0;
  cardSheet.userData.rim=rim;
  scene.add(cardPivot);
  shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.08,1.08),new THREE.ShadowMaterial({color:0x000000,opacity:.20}));
  shadow.rotation.x=-Math.PI/2;
  shadow.receiveShadow=true;
  shadow.position.y=.014;scene.add(shadow);
}
function updateCardSize(){
  frontFace.scale.set(cardWidth,cardLength,1);backFace.scale.set(cardWidth,cardLength,1);
  cardSheet.userData.rim.scale.set(cardWidth,cardLength,1);
  cardSheet.scale.set(1,1,1);
  shadow.scale.set(cardWidth*1.15,cardLength*1.13,1);
}
function replaceTexture(mesh,texture){
  if(mesh.material.map){mesh.material.map.dispose();}
  mesh.material.map=texture;mesh.material.needsUpdate=true;
}
const groundRay=new THREE.Raycaster();
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function targetGround(clientX,clientY){
  const r=view.getBoundingClientRect();
  const x=(clientX-r.left)/r.width*2-1,y=-(clientY-r.top)/r.height*2+1;
  groundRay.setFromCamera(new THREE.Vector2(x,y),camera);
  return groundRay.ray.intersectPlane(groundPlane,new THREE.Vector3()) || new THREE.Vector3(0,0,0);
}
function mapRect(rect,rx=.5,ry=.5){
  return targetGround(rect.left+rect.width*rx,rect.top+rect.height*ry);
}
function pileCardTexture(type){
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=632;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle=type==="again"?"#f4dfd0":"#e8edd8";ctx.fillRect(0,0,512,632);
  ctx.strokeStyle=type==="again"?"#d2a28f":"#9fbea6";ctx.lineWidth=8;ctx.strokeRect(20,20,472,592);
  ctx.beginPath();ctx.arc(256,320,122,0,TAU);ctx.lineWidth=10;ctx.strokeStyle=type==="again"?"#b87963":"#5a9374";ctx.stroke();
  ctx.fillStyle=type==="again"?"#b87963":"#5a9374";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="bold 160px Georgia";ctx.fillText(type==="again"?"↶":"✓",256,322);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  return tex;
}
function createPile(type){
  const group=new THREE.Group(),texture=pileCardTexture(type);
  for(let i=0;i<5;i++){
    const paper=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(1,1,.027),new THREE.MeshStandardMaterial({color:i<4?"#f3ecdb":"#f6f1e2",roughness:.95}));
    const image=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({map:texture,roughness:.85}));
    image.position.z=.017;paper.add(box,image);
    paper.rotation.x=-Math.PI/2;
    paper.userData={box,image};
    paper.rotation.z=(i-2)*.08;
    paper.receiveShadow=true;
    box.castShadow=box.receiveShadow=true;image.receiveShadow=true;
    group.add(paper);
    papers.push(paper);
  }
  scene.add(group);
  piles[type]=group;
}
function pileTarget(type){
  const pill=document.getElementById(type==="again"?"againPile":"knownPile");
  const img=pill.querySelector('.pile-image').getBoundingClientRect();
  const p=mapRect(img,.5,.5);
  const left=targetGround(img.left,img.top+img.height/2),right=targetGround(img.right,img.top+img.height/2);
  const top=targetGround(img.left+img.width/2,img.top),bottom=targetGround(img.left+img.width/2,img.bottom);
  return {point:p,width:Math.abs(right.x-left.x),height:Math.abs(top.z-bottom.z)};
}
function syncLayout(){
  if(!initialized) return;
  const r=view.getBoundingClientRect();
  renderer.setSize(r.width,r.height,false);
  camera.left=-5.1*(r.width/r.height);camera.right=5.1*(r.width/r.height);camera.top=5.1;camera.bottom=-5.1;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const el=document.getElementById('card').getBoundingClientRect();
  const c=mapRect(el);
  const l=targetGround(el.left,el.top+el.height/2),right=targetGround(el.right,el.top+el.height/2);
  const t=targetGround(el.left+el.width/2,el.top),bottom=targetGround(el.left+el.width/2,el.bottom);
  layout.center=c;
  cardWidth=Math.max(1,Math.abs(right.x-l.x)*.98);
  cardLength=Math.max(1.4,Math.abs(t.z-bottom.z)*.96);
  updateCardSize();
  if(!flipTask&&!flyTask&&!dragging) {
    cardPivot.position.copy(c);cardPivot.position.y=.19;
    cardSheet.rotation.y=flipBack?Math.PI:0;
  }
  shadow.position.set(c.x,.016,c.z);
  for(const type of ["again","known"]){
    const tar=pileTarget(type),pile=piles[type];
    if(!pile)continue;
    pile.position.set(tar.point.x,.07,tar.point.z);
    const w=Math.max(.7,tar.width*.93),h=Math.max(.85,tar.height*.91);
    pile.children.forEach((paper,i)=>{
      paper.userData.box.scale.set(w,h,1);
      paper.userData.image.scale.set(w,h,1);
      paper.position.set(i*.014,(i-2)*.018,(i-2)*.012);
      paper.visible=i<Math.min(5,Math.max(3,Math.ceil(3+(pile.userData.count||0)/160)));
    });
  }
  if(handRoot && !flipTask) positionHand(false,1);
}
function positionHand(grabbing,progress){
  if(!layout.center||!handRoot) return;
  const home=new THREE.Vector3(layout.center.x+cardWidth*.60,.70,layout.center.z+cardLength*.51);
  const hold=new THREE.Vector3(layout.center.x+cardWidth*.43,.41,layout.center.z+cardLength*.05);
  handRoot.position.lerpVectors(home,hold,grabbing?progress:0);
  handRoot.rotation.set(.45+(grabbing?-.35*progress:0),-.57+(grabbing?-.5*progress:0),-.52+(grabbing?.2*progress:0));
  if(sleeve && cuff) {
    const start=handRoot.position.clone().add(new THREE.Vector3(.62,-.10,.14));
    const end=start.clone().add(new THREE.Vector3(5.0,-.30,3.0));
    const direction=end.clone().sub(start);
    sleeve.position.copy(start).add(end).multiplyScalar(.5);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    cuff.position.copy(start);
    cuff.quaternion.copy(sleeve.quaternion);
  }
  // The GLB is skinned, with 25 named WebXR joints. Pose the proximal bones to pinch the paper edge.
  const amount=grabbing?progress:0;
  for(const [name,b] of Object.entries(handBones)){
    const orig=b.userData.restQuat;if(!orig)continue;
    const theta=name.includes("thumb")?-.18*amount:name.includes("index")?-.38*amount:-.13*amount;
    b.quaternion.copy(orig).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),theta));
  }
}
function makeSkinPattern(mesh){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle="#dda986";ctx.fillRect(0,0,256,256);
  for(let i=0;i<3100;i++){
    const x=(i*131.782)%256,y=(i*37.781)%256;
    ctx.fillStyle=i%4===0?"#bf826019":"#fce7bd18";ctx.fillRect(x,y,2,2);
  }
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  mesh.material=new THREE.MeshStandardMaterial({map:tex,color:0xffffff,roughness:.78,metalness:0,side:THREE.DoubleSide});
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
}
async function loadHand(){
  const loader=new GLTFLoader();
  const gltf=await loader.loadAsync("./assets/hand-right.glb");
  handRoot=new THREE.Group();handContainer=new THREE.Group();
  handRoot.add(handContainer);handContainer.add(gltf.scene);
  // Convert the .1-metre real-scale model into a desk-sized, articulated hand.
  const bbox=new THREE.Box3().setFromObject(gltf.scene);
  const sz=bbox.getSize(new THREE.Vector3()),center=bbox.getCenter(new THREE.Vector3());
  const length=Math.max(sz.x,sz.y,sz.z);
  const multiplier=3.95/Math.max(length,.1);
  handContainer.scale.setScalar(multiplier);
  gltf.scene.position.set(-center.x,-center.y,-center.z);
  handContainer.rotation.set(-.25,Math.PI*.65,-.4);
  gltf.scene.traverse(o=>{
    if(o.isMesh) makeSkinPattern(o);
    if(o.isBone && /finger|thumb/.test(o.name) && /proximal|intermediate|distal/.test(o.name)) {
      handBones[o.name]=o;
      o.userData.restQuat=o.quaternion.clone();
    }
  });
  scene.add(handRoot);
  const cloth=new THREE.MeshStandardMaterial({color:0x173f32,roughness:.97,metalness:0});
  sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.91,.60,5.85,24,1),cloth);
  sleeve.receiveShadow=true;
  scene.add(sleeve);
  cuff=new THREE.Mesh(new THREE.CylinderGeometry(.70,.66,.20,24),new THREE.MeshStandardMaterial({color:0x234f3e,roughness:.94}));
  scene.add(cuff);
}
function canvasMat(){
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  g.fillStyle='#20483c';g.fillRect(0,0,512,512);
  for(let i=0;i<25000;i++) {
    const x=(i*117.13)%512,y=(i*67.71)%512;
    g.fillStyle=i%6===0?'#e8c99e0b':'#081e150c';
    g.fillRect(x,y,1+(i%3),1);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);return t;
}
async function init(){
  if(initialized) return;
  view=document.createElement('canvas');view.className="webgl-desk";view.setAttribute('aria-hidden','true');
  document.getElementById('desk').appendChild(view);
  renderer=new THREE.WebGLRenderer({canvas:view,antialias:false,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.1));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();
  camera=new THREE.OrthographicCamera(-10,10,5.1,-5.1,.05,120);
  camera.position.set(0,16,7.2);
  camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  scene.add(new THREE.AmbientLight(0xf6e7d2,.75));
  const hemi=new THREE.HemisphereLight(0xe0ffe6,0x244b39,1.15);scene.add(hemi);
  const key=new THREE.DirectionalLight(0xffdfbf,2.3);
  key.position.set(-3,12,7);key.castShadow=true;key.shadow.mapSize.set(512,512);
  key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;
  key.shadow.bias=-.0004;scene.add(key);
  const fill=new THREE.DirectionalLight(0xa3edc4,.4);fill.position.set(6,9,-3);scene.add(fill);
  const top=new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.MeshStandardMaterial({map:canvasMat(),roughness:1,side:THREE.DoubleSide}));
  top.rotation.x=-Math.PI/2;top.position.y=-.055;top.receiveShadow=true;scene.add(top);
  buildCard();createPile('again');createPile('known');
  initialized=true;
  await document.fonts.ready;
  syncLayout();
  try {await loadHand();}
  catch(e){console.warn('Model dłoni nie mógł zostać załadowany',e);}
  positionHand(false,1);
  const resizeObserver=new ResizeObserver(syncLayout);resizeObserver.observe(document.getElementById('desk'));
  window.addEventListener('resize',syncLayout,{passive:true});
  let last=performance.now();
  function frame(now){
    requestAnimationFrame(frame);
    const busy=Boolean(flipTask||flyTask||springTask||dragging);
    if(now-last<(busy?32:270))return;
    last=now;
    animate(now);
    renderer.render(scene,camera);
    firstFrame=true;
  }
  requestAnimationFrame(frame);
  document.getElementById('desk').classList.add('is-real-3d');
}
function setCard(front,back,serial){
  words={front,back,number:serial};
  if(!initialized)return;
  replaceTexture(frontFace,createTexture('front',front,serial));
  replaceTexture(backFace,createTexture('back',back,serial));
  flipTask=flyTask=springTask=null;dragging=false;draggedX=draggedY=0;
  flipBack=false;
  cardSheet.rotation.y=0;cardSheet.rotation.x=-Math.PI/2;
  cardPivot.visible=true;cardPivot.rotation.set(0,0,0);
  cardPivot.position.set(layout.center.x,.19,layout.center.z);
  cardPivot.scale.set(1,1,1);
  if(handRoot)positionHand(false,1);
}
function setCounts(counts){
 for(const k of ['again','known']){ if(piles[k])piles[k].userData.count=counts[k]||0; }
}
function flip(){
 if(!initialized||flyTask||flipTask)return;
 flipTask={start:performance.now(),duration:1250,from:flipBack?Math.PI:0,to:flipBack?0:Math.PI};
}
function fly(choice){
 if(!initialized)return;
 flipTask=null;springTask=null;
 const target=piles[choice]?.position.clone();
 if(!target)return;
 flyTask={start:performance.now(),duration:540,from:cardPivot.position.clone(),to:target,angle:choice==='again'?-0.38:.38};
}
function drag(dx,dy){
 if(!initialized||flyTask)return;
 dragging=true;draggedX=dx;draggedY=dy;
 // Project pointer movement onto the physical table, maintaining the lifted card height.
 const r=view.getBoundingClientRect();
 const here=targetGround(r.left+r.width/2,r.top+r.height/2);
 const there=targetGround(r.left+r.width/2+dx,r.top+r.height/2+dy);
 cardPivot.position.set(layout.center.x+there.x-here.x,.42,layout.center.z+there.z-here.z);
 cardPivot.rotation.set(Math.min(.15,dy*.001),0,Math.max(-.3,Math.min(.3,-dx*.0012)));
}
function release(){
 if(!initialized||!dragging)return;
 dragging=false;
 springTask={start:performance.now(),duration:320,from:cardPivot.position.clone(),fromRot:cardPivot.rotation.z};
}
function animate(now){
 if(flipTask){
  const t=Math.min(1,(now-flipTask.start)/flipTask.duration),u=smooth(t);
  const grab=smooth(Math.min(1,t/.32));
  const released=1-smooth(Math.max(0,(t-.75)/.25));
  positionHand(true,Math.min(grab,released));
  const phase=smooth(Math.max(0,Math.min(1,(t-.22)/.62)));
  cardSheet.rotation.y=lerp(flipTask.from,flipTask.to,phase);
  cardPivot.position.y=.19+Math.sin(Math.PI*phase)*.37;
  cardPivot.position.x=layout.center.x+.08*Math.sin(Math.PI*phase);
  cardPivot.rotation.z=.04*Math.sin(Math.PI*phase);
  if(t===1){
   flipBack=!flipBack;flipTask=null;cardPivot.position.set(layout.center.x,.19,layout.center.z);
   cardPivot.rotation.set(0,0,0);positionHand(false,1);
  }
 }
 if(flyTask){
  const t=Math.min(1,(now-flyTask.start)/flyTask.duration),u=smooth(t);
  cardPivot.position.lerpVectors(flyTask.from,flyTask.to,u);
  cardPivot.position.y=lerp(flyTask.from.y,.17,u)+Math.sin(Math.PI*t)*.74;
  cardPivot.rotation.y=u*flyTask.angle;
  cardPivot.rotation.z=u*flyTask.angle;
  cardPivot.scale.setScalar(1-u*.55);
  if(t===1){cardPivot.visible=false;flyTask=null;}
 }
 if(springTask){
  const t=Math.min(1,(now-springTask.start)/springTask.duration),u=1-Math.pow(1-t,3);
  cardPivot.position.lerpVectors(springTask.from,new THREE.Vector3(layout.center.x,.19,layout.center.z),u);
  cardPivot.rotation.z=lerp(springTask.fromRot,0,u);
  if(t===1){cardPivot.rotation.set(0,0,0);springTask=null;}
 }
}
export const desk3D={init,setCard,setCounts,flip,fly,drag,release,get ready(){return initialized;}};
