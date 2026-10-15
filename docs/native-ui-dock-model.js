/* Review-only model. Never imported by either native app. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NativeDockReview = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  // Reference: app/src/components/GlassTabBar.tsx. Native gesture thresholds remain unverified.
  const gesture = Object.freeze({capture:16, dominance:1.25, commit:44, holdMs:420});
  const sideName = side => side === 'left' ? 'trái' : 'phải';
  function initial(slots={left:null,right:null}) {
    return {slots:{...slots},active:'home',minimized:null,picker:null,undo:null,message:'Vuốt từ Khám phá ở giữa để thêm lối tắt trái hoặc phải.'};
  }
  function update(state, event, validIds) {
    const side = event.side;
    const validSide = side === 'left' || side === 'right';
    if(event.type==='PICK') {
      if(!validSide || state.picker || state.active!=='home') return state;
      return {...state,picker:side,message:'Chọn lối tắt bên '+sideName(side)+'.'};
    }
    if(event.type==='CANCEL') return {...state,picker:null,message:'Đã hủy. Dock được giữ nguyên.'};
    if(event.type==='CHOOSE') {
      if(!state.picker || !validIds.includes(event.id)) return state;
      const other=state.picker==='left'?'right':'left';
      if(state.slots[other]===event.id) return {...state,message:'Lối tắt đã ở bên '+sideName(other)+'. Chọn tiện ích khác.'};
      const chosenSide=state.picker;
      // Changing a shortcut does not navigate or close the current mini-app.
      return {...state,slots:{...state.slots,[chosenSide]:event.id},picker:null,undo:state.undo?.side===chosenSide?null:state.undo,message:'Đã cập nhật lối tắt bên '+sideName(chosenSide)+' trong prototype.'};
    }
    if(event.type==='REMOVE') {
      if(!validSide || state.picker || state.active!=='home' || !state.slots[side] || (event.expected && state.slots[side]!==event.expected)) return state;
      return {...state,slots:{...state.slots,[side]:null},undo:{side,id:state.slots[side]},message:'Đã xóa lối tắt bên '+sideName(side)+'. Có thể Hoàn tác.'};
    }
    if(event.type==='UNDO') {
      if(!state.undo || state.picker || state.active!=='home') return state;
      const {side:undoSide,id}=state.undo;
      if(state.slots[undoSide] || Object.values(state.slots).includes(id)) return {...state,undo:null,message:'Dock đã thay đổi. Không ghi đè lối tắt đang có.'};
      return {...state,slots:{...state.slots,[undoSide]:id},undo:null,message:'Đã khôi phục lối tắt trong prototype.'};
    }
    if(event.type==='OPEN') {
      if(state.picker || !['home','explore',...validIds].includes(event.id)) return state;
      return {...state,active:event.id,minimized:validIds.includes(event.id)?null:state.minimized,message:'Đổi vùng đang xem trong prototype; chưa mở tiện ích thật.'};
    }
    if(event.type==='MINIMIZE') {
      if(state.picker || !validIds.includes(state.active)) return state;
      return {...state,active:'home',minimized:state.active,message:'Đã thu nhỏ tiện ích vào nút nổi. Trang con và nháp được giữ trong phiên review.'};
    }
    if(event.type==='CLOSED') {
      if(!validIds.includes(event.id)) return state;
      return {...state,active:state.active===event.id?'home':state.active,minimized:state.minimized===event.id?null:state.minimized,message:'Đã đóng tiện ích trong prototype.'};
    }
    return state;
  }
  function swipe(dx,dy) {
    return Math.abs(dx)>=gesture.commit && Math.abs(dx)>Math.abs(dy)*gesture.dominance ? (dx<0?'left':'right') : null;
  }
  function controller({onSwipe,onHold,setTimer=setTimeout,clearTimer=clearTimeout}) {
    let contact=null,timer=null,suppress=false;
    function clear(){if(timer!==null)clearTimer(timer);timer=null;}
    function cancel(){clear();contact=null;}
    return {
      down(id,x,y,slot=null,canSwipe=true){cancel();suppress=false;contact={id,x,y,dx:0,dy:0,slot,canSwipe,captured:false,held:false,vertical:false};
        if(slot)timer=setTimer(()=>{timer=null;if(contact && !contact.captured && !contact.vertical){contact.held=true;suppress=true;onHold(contact.slot);}},gesture.holdMs);
      },
      move(id,x,y){if(!contact || contact.id!==id)return false;const c=contact;c.dx=x-c.x;c.dy=y-c.y;
        if(c.held)return true;
        if(c.vertical)return false;
        if(Math.abs(c.dy)>gesture.capture && Math.abs(c.dy)>=Math.abs(c.dx)/gesture.dominance){c.vertical=true;clear();return false;}
        if(Math.abs(c.dx)>gesture.capture && Math.abs(c.dx)>Math.abs(c.dy)*gesture.dominance){c.captured=true;suppress=true;clear();}
        return c.captured;
      },
      up(id,x,y){if(!contact || contact.id!==id)return;this.move(id,x,y);const c=contact;clear();contact=null;
        if(c.canSwipe && c.captured && !c.held && !c.vertical){const side=swipe(c.dx,c.dy);if(side)onSwipe(side);}
      },
      cancel,
      suppressClick(){return suppress;}
    };
  }
  function presentation(state) {
    const home=state.active==='home';
    return {central:home?'explore':'home',left:home?state.slots.left:null,right:home?state.slots.right:null,floating:home?state.minimized:null,canPick:home};
  }
  return {gesture,initial,update,swipe,controller,presentation};
});
