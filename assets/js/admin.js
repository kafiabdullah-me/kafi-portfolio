import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app), storage=getStorage(app);
const $=s=>document.querySelector(s);
const esc=(v="")=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const slugify=v=>String(v||"").toLowerCase().trim().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");
let articles=[],projects=[],messages=[];

document.addEventListener("DOMContentLoaded",()=>{
  setTimeout(()=>$("#page-loader")?.classList.add("done"),220);
  initNavigation();initEditors();
  $("#login-form").addEventListener("submit",login);
  $("#logout").addEventListener("click",()=>signOut(auth));
  onAuthStateChanged(auth,user=>{
    if(user && user.email===ADMIN_EMAIL){showApp(user);loadAll()}
    else if(user){$("#login-status").textContent="This account is not authorized for the portfolio admin.";signOut(auth)}
    else showLogin();
  });
});
async function login(e){e.preventDefault();const b=e.target.querySelector("button");$("#login-status").textContent="Signing in…";b.disabled=true;try{await signInWithEmailAndPassword(auth,$("#email").value,$("#password").value)}catch(err){$("#login-status").textContent=prettyAuthError(err)}finally{b.disabled=false}}
function prettyAuthError(e){if(e.code==="auth/invalid-credential")return"Email or password is incorrect.";if(e.code==="auth/too-many-requests")return"Too many attempts. Try again later.";return e.message||"Login failed."}
function showLogin(){$("#login-view").classList.remove("hidden");$("#app-shell").classList.add("hidden")}
function showApp(user){$("#login-view").classList.add("hidden");$("#app-shell").classList.remove("hidden");$("#admin-email").textContent=user.email||""}
function initNavigation(){
  document.querySelectorAll(".side-nav button").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
  document.querySelectorAll("[data-view-jump]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.viewJump)));
  $("#side-open")?.addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
}
function switchView(name){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$("#view-"+name)?.classList.add("active");document.querySelectorAll(".side-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$(".sidebar")?.classList.remove("open")}
async function loadAll(){await Promise.all([loadArticles(),loadProjects(),loadMessages(),loadStats()]);renderDashboardMessages();renderMessages();renderArticleList();renderProjectList();if(!$("#article-editor").dataset.ready)showArticleEditor();if(!$("#project-editor").dataset.ready)showProjectEditor();setInterval(loadStats,30000)}
async function loadArticles(){const s=await getDocs(collection(db,"posts"));articles=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.publishDate?.toMillis?.()||0)-(a.publishDate?.toMillis?.()||0))}
async function loadProjects(){const s=await getDocs(collection(db,"projects"));projects=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0))}
async function loadMessages(){const s=await getDocs(query(collection(db,"messages"),limit(100)));messages=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0))}
async function loadStats(){
  $("#stat-articles").textContent=articles.length;$("#stat-published").textContent=articles.filter(x=>x.published).length;$("#stat-projects").textContent=projects.length;$("#stat-messages").textContent=messages.length;
  try{const s=await getDocs(collection(db,"visitorSessions"));$("#stat-visits").textContent=s.size;const cutoff=Date.now()-120000;let active=0;s.forEach(d=>{const t=d.data().lastSeen?.toMillis?.()||0;if(t>=cutoff)active++});$("#stat-active").textContent=active}catch(e){$("#stat-visits").textContent="—";$("#stat-active").textContent="—"}
}
function renderDashboardMessages(){const el=$("#dashboard-messages");el.innerHTML=messages.slice(0,5).map(m=>`<div class="message-row message-clickable" data-msg="${m.id}"><div><div class="row-title">${esc(m.name||"Unknown")}</div><div class="row-meta">${esc(m.email||"")} · ${esc(m.status||"new")}</div><div class="row-meta">${esc((m.message||"").slice(0,100))}</div></div><span class="detail-hint">Click to view details ↗</span></div>`).join("")||"<div class='message-row'>No messages yet.</div>";el.querySelectorAll("[data-msg]").forEach(x=>x.onclick=()=>{switchView("messages");openMessage(x.dataset.msg)})}
function renderArticleList(filter=""){const el=$("#article-list");const arr=articles.filter(a=>(a.title||"").toLowerCase().includes(filter.toLowerCase()));el.innerHTML=arr.map(a=>`<div class="article-row" data-id="${a.id}"><div class="row-title">${esc(a.title)}</div><div class="row-meta">${esc(a.category||"General")} · <span class="badge ${a.published?"":"draft"}">${a.published?"Published":"Draft"}</span></div></div>`).join("")||"<div class='message-row'>No articles.</div>";el.querySelectorAll("[data-id]").forEach(x=>x.onclick=()=>editArticle(x.dataset.id))}
function renderProjectList(filter=""){const el=$("#project-list");const arr=projects.filter(a=>(a.title||"").toLowerCase().includes(filter.toLowerCase()));el.innerHTML=arr.map(a=>`<div class="project-row" data-id="${a.id}"><div class="row-title">${esc(a.title)}</div><div class="row-meta">${esc(a.label||"Project")} · <span class="badge ${a.published?"":"draft"}">${a.published?"Published":"Draft"}</span></div></div>`).join("")||"<div class='message-row'>No projects.</div>";el.querySelectorAll("[data-id]").forEach(x=>x.onclick=()=>editProject(x.dataset.id))}
function initEditors(){$("#new-article").onclick=()=>showArticleEditor();$("#new-project").onclick=()=>showProjectEditor();$("#article-search").oninput=e=>renderArticleList(e.target.value);$("#project-search").oninput=e=>renderProjectList(e.target.value)}
function toolbar(){return `<div class="toolbar"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><button type="button" data-cmd="formatBlock" data-val="h2">H2</button><button type="button" data-cmd="formatBlock" data-val="h3">H3</button><button type="button" data-cmd="insertUnorderedList">• List</button><button type="button" data-cmd="insertOrderedList">1. List</button><button type="button" data-cmd="formatBlock" data-val="blockquote">Quote</button><button type="button" data-cmd="createLink">Link</button></div>`}
function editorHTML(type,data={}){
 const isA=type==="article";const title=data.title||"",slug=data.slug||"",desc=data.excerpt||data.description||"",cover=data.coverUrl||"",content=data.contentHtml||"";
 return `<div class="editor-header"><div><p class="eyebrow">${isA?"ARTICLE EDITOR":"PROJECT EDITOR"}</p><h2>${data.id?"Edit":"Create"} ${isA?"article":"project"}</h2></div><div class="editor-actions"><button type="button" data-cancel>Cancel</button><button type="button" data-save>Save draft</button><button type="button" class="publish" data-publish>${data.published?"Update published":"Publish"}</button><button type="button" class="danger" data-delete ${data.id?"":"disabled"}>Delete</button></div></div>
 <div class="editor-grid">
 <label>Title<input data-field="title" value="${esc(title)}" placeholder="${isA?"Article title":"Project title"}"></label>
 <label>Slug<input data-field="slug" value="${esc(slug)}" placeholder="auto-generated-from-title"></label>
 ${isA?`<label>Category<input data-field="category" value="${esc(data.category||"")}" placeholder="Personal Growth"></label><label>Read time<select data-field="readTime"><option ${data.readTime==="3 min read"?"selected":""}>3 min read</option><option ${data.readTime==="5 min read"?"selected":""}>5 min read</option><option ${data.readTime==="8 min read"?"selected":""}>8 min read</option><option ${data.readTime==="12 min read"?"selected":""}>12 min read</option></select></label>`:`<label>Label<input data-field="label" value="${esc(data.label||"")}" placeholder="Web Development"></label><label>Tech stack<input data-field="techStack" value="${esc(data.techStack||"")}" placeholder="HTML, CSS, Firebase"></label><label class="full">Project URL<input type="url" data-field="projectUrl" value="${esc(data.projectUrl||"")}" placeholder="https://example.com"></label>`}
 <label class="full">${isA?"Excerpt":"Description"}<textarea data-field="${isA?"excerpt":"description"}" rows="3">${esc(desc)}</textarea></label>
 <div class="full cover-upload"><div class="cover-preview" data-cover-preview>${cover?`<img src="${esc(cover)}" alt="">`:"Cover preview"}</div><label>Cover image<input type="url" data-field="coverUrl" value="${esc(cover)}" placeholder="https://…"><input type="file" accept="image/*" data-cover-file><small class="row-meta">Paste a URL or choose an image. Choosing a file uploads it to Firebase Storage.</small></label></div>
 <div class="full"><label>Content</label>${toolbar()}<div class="rich-editor" contenteditable="true" data-editor>${content}</div></div>
 </div>`;
}
function bindEditor(type,existing={}){
 const box=type==="article"?$("#article-editor"):$("#project-editor");box.dataset.ready="1";box.dataset.id=existing.id||"";
 const titleInput=box.querySelector("[data-field='title']"),slugInput=box.querySelector("[data-field='slug']");
 let slugTouched=Boolean(existing.slug);
 titleInput?.addEventListener("input",()=>{if(!slugTouched)slugInput.value=slugify(titleInput.value)});
 slugInput?.addEventListener("input",()=>{slugTouched=true});
 if(!existing.slug && titleInput)slugInput.value=slugify(titleInput.value);
 box.querySelectorAll("[data-cmd]").forEach(b=>b.onclick=()=>{if(b.dataset.cmd==="createLink"){const u=prompt("URL");if(u)document.execCommand("createLink",false,u)}else if(b.dataset.cmd==="formatBlock")document.execCommand("formatBlock",false,b.dataset.val);else document.execCommand(b.dataset.cmd,false,null);box.querySelector("[data-editor]")?.focus()});
 box.querySelector("[data-cover-file]")?.addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>box.querySelector("[data-cover-preview]").innerHTML=`<img src="${r.result}" alt="">`;r.readAsDataURL(f)});
 box.querySelector("[data-field='coverUrl']")?.addEventListener("input",e=>{const v=e.target.value.trim();box.querySelector("[data-cover-preview]").innerHTML=v?`<img src="${esc(v)}" alt="">`:"Cover preview"});
 box.querySelector("[data-cancel]").onclick=()=>{type==="article"?showArticleEditor():showProjectEditor()};
 box.querySelector("[data-delete]").onclick=()=>deleteContent(type);
 box.querySelector("[data-save]").onclick=()=>saveContent(type,false);
 box.querySelector("[data-publish]").onclick=()=>saveContent(type,true);
}
function showArticleEditor(data={}){$("#article-editor").innerHTML=editorHTML("article",data);bindEditor("article",data)}
function showProjectEditor(data={}){$("#project-editor").innerHTML=editorHTML("project",data);bindEditor("project",data)}
function collect(type){const box=type==="article"?$("#article-editor"):$("#project-editor");const get=k=>box.querySelector(`[data-field="${k}"]`)?.value.trim()||"";return {title:get("title"),slug:get("slug"),category:get("category"),readTime:get("readTime"),excerpt:get("excerpt"),label:get("label"),techStack:get("techStack"),description:get("description"),projectUrl:get("projectUrl"),coverUrl:get("coverUrl"),contentHtml:box.querySelector("[data-editor]")?.innerHTML||"",file:box.querySelector("[data-cover-file]")?.files?.[0]||null}}
async function saveContent(type,published){const box=type==="article"?$("#article-editor"):$("#project-editor");const data=collect(type);if(!data.title){alert("Please add a title.");return}if(!data.slug)data.slug=slugify(data.title);const id=box.dataset.id;const btn=box.querySelector(published?"[data-publish]":"[data-save]");btn.disabled=true;btn.textContent="Saving…";try{
 if(data.file){const path=`${type}s/${Date.now()}-${data.file.name.replace(/[^a-z0-9._-]/gi,"-")}`;const r=ref(storage,path);await uploadBytes(r,data.file);data.coverUrl=await getDownloadURL(r)}
 const payload=type==="article"?{title:data.title,slug:data.slug,category:data.category||"General",readTime:data.readTime||"5 min read",excerpt:data.excerpt,coverUrl:data.coverUrl,contentHtml:data.contentHtml,published,publishDate:serverTimestamp(),updatedAt:serverTimestamp()}:{title:data.title,slug:data.slug,description:data.description,label:data.label||"Web Development",techStack:data.techStack,projectUrl:data.projectUrl,coverUrl:data.coverUrl,contentHtml:data.contentHtml,published,updatedAt:serverTimestamp()};
 if(id)await updateDoc(doc(db,type==="article"?"posts":"projects",id),payload);else await addDoc(collection(db,type==="article"?"posts":"projects"),{...payload,createdAt:serverTimestamp()});
 await loadAll();type==="article"?showArticleEditor():showProjectEditor();alert(published?"Published successfully.":"Saved as draft.")
 }catch(e){console.error(e);alert("Could not save: "+e.message)}finally{btn.disabled=false;btn.textContent=published?(box.dataset.id?"Update published":"Publish"):"Save draft"}}
async function deleteContent(type){
  const box=type==="article"?$("#article-editor"):$("#project-editor");
  const id=box.dataset.id;
  if(!id)return;
  if(!confirm(`Delete this ${type==="article"?"article":"project"}? This cannot be undone.`))return;
  const btn=box.querySelector("[data-delete]");
  btn.disabled=true;btn.textContent="Deleting…";
  try{
    await deleteDoc(doc(db,type==="article"?"posts":"projects",id));
    await loadAll();
    type==="article"?showArticleEditor():showProjectEditor();
    alert(`${type==="article"?"Article":"Project"} deleted.`);
  }catch(e){console.error(e);alert("Could not delete: "+e.message);btn.disabled=false;btn.textContent="Delete"}
}
function editArticle(id){const x=articles.find(a=>a.id===id);if(x)showArticleEditor(x)}
function editProject(id){const x=projects.find(a=>a.id===id);if(x)showProjectEditor(x)}
function renderMessages(){const el=$("#message-list");el.innerHTML=messages.map(m=>`<div class="message-row message-clickable" data-msg="${m.id}"><div><div class="row-title">${esc(m.name||"Unknown")}</div><div class="row-meta">${esc(m.email||"")}</div><div class="row-meta">${esc((m.message||"").slice(0,90))}</div></div><span class="detail-hint">Click to view details ↗</span></div>`).join("")||"<div class='message-row'>No messages.</div>";el.querySelectorAll("[data-msg]").forEach(x=>x.onclick=()=>openMessage(x.dataset.msg))}
function openMessage(id){const m=messages.find(x=>x.id===id);if(!m)return;$("#message-detail").innerHTML=`<div class="detail-head"><div><p class="eyebrow">MESSAGE DETAIL</p><h2>${esc(m.name||"Unknown")}</h2><p class="row-meta">${esc(m.email||"")} ${m.phone?`· ${esc(m.phone)}`:""}</p></div><span class="badge">${esc(m.status||"new")}</span></div><div class="detail-body">${esc(m.message||"")}</div><div class="detail-actions"><a class="primary" href="mailto:${encodeURIComponent(m.email||"")}?subject=${encodeURIComponent("Re: Your message to Kafi Abdullah")}">Reply by email ↗</a><button class="ghost" id="mark-read">Mark as read</button><button class="danger" id="delete-msg">Delete</button></div>`;$("#mark-read").onclick=async()=>{await updateDoc(doc(db,"messages",id),{status:"read"});await loadMessages();renderMessages();openMessage(id)};$("#delete-msg").onclick=async()=>{if(confirm("Delete this message?")){await deleteDoc(doc(db,"messages",id));await loadMessages();renderMessages();$("#message-detail").innerHTML="<div class='detail-empty'>Message deleted.</div>"}}}
