const crypto = require('node:crypto');
const BASE = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_PASSWORD = process.env.MINIHOME_OWNER_PASSWORD;
const SIGNING = process.env.MINIHOME_TOKEN_SECRET;
const originHeaders = {'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(code,data)=>({statusCode:code,headers:originHeaders,body:JSON.stringify(data)});
function verifyToken(value){
  if(!SIGNING||!value)return false;
  const [payload,signature]=value.split('.');if(!payload||!signature)return false;
  const expected=crypto.createHmac('sha256',SIGNING).update(payload).digest('base64url');
  if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return false;
  try{const body=JSON.parse(Buffer.from(payload,'base64url').toString());return body.exp>Date.now()&&body.scope==='minihome-owner'}catch{return false}
}
function mint(){const payload=Buffer.from(JSON.stringify({scope:'minihome-owner',exp:Date.now()+8*3600*1000})).toString('base64url');return payload+'.'+crypto.createHmac('sha256',SIGNING).update(payload).digest('base64url')}
async function rest(path,options={}){
 const r=await fetch(BASE.replace(/\/$/,'')+'/rest/v1/'+path,{...options,headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json',...(options.headers||{})}});
 if(!r.ok)throw Error('Supabase '+r.status+': '+(await r.text()).slice(0,350));
 return r.status===204?null:r.json();
}
exports.handler=async(event)=>{
 if(!BASE||!SERVICE||!OWNER_PASSWORD||!SIGNING)return reply(503,{error:'Netlify 환경 변수 4개를 설정해 줘.'});
 try{
  if(event.httpMethod==='GET'){
   const rows=await rest('minihome_content?id=eq.main&select=content&limit=1');
   return reply(200,{exists:rows.length>0,content:rows[0]?.content||null});
  }
  if(event.httpMethod!=='POST')return reply(405,{error:'지원하지 않는 요청'});
  const body=JSON.parse(event.body||'{}');
  if(body.action==='login'){
   const a=Buffer.from(String(body.password||''));const b=Buffer.from(OWNER_PASSWORD);
   if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return reply(401,{error:'온라인 저장 비밀번호가 Netlify 설정과 달라. 동일하게 설정해 줘.'});
   return reply(200,{token:mint()});
  }
  const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
  if(!verifyToken(token))return reply(401,{error:'온라인 저장 인증이 필요해. 간편 로그인을 다시 해 줘.'});
  if(body.action==='save'){
   const content=body.content;
   if(!content||typeof content!=='object'||!Array.isArray(content.photos)||!Array.isArray(content.diaries)||!content.settings)return reply(400,{error:'저장 데이터 형식 오류'});
   const bytes=Buffer.byteLength(JSON.stringify(content));if(bytes>4*1024*1024)return reply(413,{error:'사진 용량이 너무 커. 사진을 줄여서 다시 시도해 줘.'});
   await rest('minihome_content?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:'main',content,updated_at:new Date().toISOString()})});
   return reply(200,{ok:true});
  }
  if(body.action==='upload'){
   const m=/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(body.data||'');
   if(!m)return reply(400,{error:'지원하지 않는 이미지 형식'});
   const bytes=Buffer.from(m[2],'base64');if(bytes.length>3.5*1024*1024)return reply(413,{error:'사진은 3.5MB 이하로 올려 줘.'});
   const ext={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[m[1]];
   const path='shared/'+crypto.randomUUID()+'.'+ext;
   const r=await fetch(BASE.replace(/\/$/,'')+'/storage/v1/object/minihome-photos/'+path,{method:'POST',headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':m[1],'x-upsert':'false'},body:bytes});
   if(!r.ok)throw Error('사진 업로드 실패: '+r.status+' '+(await r.text()).slice(0,150));
   return reply(200,{url:BASE.replace(/\/$/,'')+'/storage/v1/object/public/minihome-photos/'+path});
  }
  return reply(400,{error:'알 수 없는 작업'});
 }catch(e){console.error(e);return reply(500,{error:e.message||'서버 오류'})}
};
