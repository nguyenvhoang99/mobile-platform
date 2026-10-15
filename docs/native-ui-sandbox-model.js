/* Design-review state only. Neither native app imports this module. No untrusted code executes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NativeSandboxReview=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const scenarios=['content','loading','empty','offline','denied','unavailable','error','crashed'];
 const pages={sample:['root','storage','bill'],card:['root','detail']};
 const fields={note:500,hint:280,amount:12,recipient:120}; // Existing SampleView.swift input contracts.
 function initial(ids){return{ids:[...new Set(ids)],active:null,sessions:{},generation:0,exit:null,message:''};}
 function fresh(id,generation){return{id,page:'root',history:[],draft:{note:'',hint:'',amount:'',recipient:''},dirty:false,scenario:'content',generation,reviewed:false,message:'Dữ liệu mẫu trong phiên review; không gọi API thật.'};}
 function current(s){return s.active?s.sessions[s.active]:null;}
 function change(s,next){return{...s,sessions:{...s.sessions,[s.active]:next}};}
 function update(s,e){
  if(e.type==='OPEN'){
   if(!s.ids.includes(e.id)||s.exit)return s;
   const generation=s.generation+1,old=s.sessions[e.id];
   return{...s,active:e.id,generation,sessions:{...s.sessions,[e.id]:old?{...old,generation}:fresh(e.id,generation)},message:'Đã mở khung review.'};
  }
  if(e.type==='SUSPEND')return{...s,active:null,generation:s.generation+1,exit:null,message:'Nháp được giữ trong phiên review; reload sẽ xóa.'};
  const c=current(s);if(!c)return s;
  if(e.type==='CANCEL_CLOSE')return{...s,exit:null};
  if(e.type==='CLOSE'||e.type==='DISCARD'){
   if(e.type==='DISCARD'&&s.exit!==c.id)return s;
   if(e.type==='CLOSE'&&c.dirty)return{...s,exit:c.id};
   const sessions={...s.sessions};delete sessions[c.id];return{...s,sessions,active:null,exit:null,generation:s.generation+1,message:'Đã đóng khung và xóa nháp review của tiện ích này.'};
  }
  if(s.exit)return s;
  if(e.type==='BACK')return c.history.length?change({...s,generation:s.generation+1},{...c,page:c.history.at(-1),history:c.history.slice(0,-1),generation:s.generation+1}):update(s,{type:'CLOSE'});
  if(e.type==='PAGE'){
   if(c.scenario==='loading'||c.page!=='root'||!((pages[c.id]||['root']).includes(e.page))||e.page===c.page)return s;
   return change({...s,generation:s.generation+1},{...c,page:e.page,history:[...c.history,c.page],generation:s.generation+1});
  }
  if(e.type==='EDIT'){
   if(c.scenario==='loading'||!Object.hasOwn(fields,e.field)||typeof e.value!=='string'||e.value.length>fields[e.field])return s;
   return change(s,{...c,draft:{...c.draft,[e.field]:e.value},dirty:true,reviewed:false,message:'Nháp đã thay đổi; cần kiểm tra lại trước khi xác nhận.'});
  }
  if(e.type==='SCENARIO'&&scenarios.includes(e.value))return change({...s,generation:s.generation+1},{...c,scenario:e.value,generation:s.generation+1,message:'Mô phỏng '+e.value+'; chưa có thao tác runtime.'});
  if(e.type==='COMPLETE'){
   if(e.id!==c.id||e.generation!==c.generation||c.scenario!=='loading')return s;
   return change(s,{...c,scenario:'content',message:'Đã kết thúc mô phỏng loading.'});
  }
  if(e.type==='RETRY')return change(s,{...c,scenario:'content',message:'Đã trở lại nội dung review; chưa retry API thật.'});
  if(c.scenario==='loading')return s;
  if(e.type==='CONSENT'){
   if(e.id!==c.id||e.generation!==c.generation||c.id!=='sample'||c.page!=='bill'||typeof e.granted!=='boolean')return s;
   return change(s,{...c,scenario:e.granted?'unavailable':'denied',message:e.granted?'Đã đồng ý một lần trong mô phỏng. AI chưa khả dụng; chưa gửi dữ liệu hoặc cấp quyền thật.':'Đã từ chối trong mô phỏng. Nháp được giữ; chưa gửi dữ liệu.'});
  }
  if(e.type==='REVIEW'){
   const valid=/^[0-9]{1,12}$/.test(c.draft.amount)&&c.draft.recipient.trim().length>0;
   return change(s,{...c,reviewed:valid,message:valid?'Đã đánh dấu kiểm tra nháp review. Chưa lưu hóa đơn hoặc thanh toán.':'Nhập số tiền nguyên tối đa 12 chữ số và tên người nhận.'});
  }
  if(e.type==='DEMO_ACTION')return change(s,{...c,message:'Thao tác minh họa. Chưa đặt sân, lưu dữ liệu hay cấp quyền thật.'});
  return s;
 }
 return{initial,current,update,scenarios};
});
