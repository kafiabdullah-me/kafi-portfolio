import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, limit, getDocs, getDoc, doc, addDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const $ = (s) => document.querySelector(s);
const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const params = new URLSearchParams(location.search);

function finishLoader(){
  requestAnimationFrame(() => setTimeout(() => $(".page-loader")?.classList.add("done"), 120));
}

document.addEventListener("DOMContentLoaded", () => {
  $("#year") && ($("#year").textContent = new Date().getFullYear());
  initMenu();
  finishLoader();
});

function initMenu(){
  const btn=$(".menu-toggle"), nav=$(".site-nav"), back=$(".nav-backdrop");
  if(!btn || !nav) return;
  const close=()=>{nav.classList.remove("open");back?.classList.remove("show");btn.setAttribute("aria-expanded","false")};
  btn.addEventListener("click",()=>{const open=!nav.classList.contains("open");nav.classList.toggle("open",open);back?.classList.toggle("show",open);btn.setAttribute("aria-expanded",String(open))});
  back?.addEventListener("click",close);
  nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{
    close();
    const href=a.getAttribute("href");
    if(href) window.location.assign(href);
  }));
  window.addEventListener("resize",()=>{if(window.innerWidth>800)close()});
}

async function setupVisitor(){
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    let sid=localStorage.getItem("kafi_visit_session");
    if(!sid){sid=crypto.randomUUID();localStorage.setItem("kafi_visit_session",sid)}
    await setDoc(doc(db,"visitorSessions",sid),{uid:auth.currentUser.uid,lastSeen:serverTimestamp(),path:location.pathname},{merge:true});
  }catch(e){console.info("Visitor analytics unavailable:",e.message)}
}
setupVisitor();

function card(p,type){
  const slug=encodeURIComponent(p.slug||p.id);
  const inPages=location.pathname.includes("/pages/");
  const link=type==="post"?(inPages?`article.html?post=${slug}`:`pages/article.html?post=${slug}`):(inPages?`project.html?project=${slug}`:`pages/project.html?project=${slug}`);
  const meta=type==="post"?(p.category||"Journal"):(p.label||"Project");
  return `<a class="work-card" href="${link}">
    <div class="cover">${p.coverUrl?`<img src="${esc(p.coverUrl)}" alt="" loading="lazy">`:''}</div>
    <div class="work-body"><div class="meta">${esc(meta)}</div><h3>${esc(p.title||"Untitled")}</h3><p>${esc(p.excerpt||p.description||"Read the full story ↗")}</p><span class="card-link">Read more ↗</span></div>
  </a>`;
}

async function getPublishedPosts(max=12){
  try{const q=query(collection(db,"posts"),where("published","==",true),limit(max));const s=await getDocs(q);return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.publishDate?.toMillis?.()||0)-(a.publishDate?.toMillis?.()||0))}
  catch(e){console.error(e);return[]}
}
async function getPublishedProjects(max=20){
  try{const q=query(collection(db,"projects"),where("published","==",true),limit(max));const s=await getDocs(q);return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0))}
  catch(e){console.error(e);return[]}
}

function pager(total,page,size,onChange){
  const pages=Math.max(1,Math.ceil(total/size));
  if(pages<=1)return "";
  let html=`<div class="pager"><button data-page="${page-1}" ${page<=1?'disabled':''}>Previous</button>`;
  for(let i=1;i<=pages;i++) html+=`<button class="${i===page?'active':''}" data-page="${i}">${i}</button>`;
  html+=`<button data-page="${page+1}" ${page>=pages?'disabled':''}>Next</button></div>`;
  setTimeout(()=>document.querySelectorAll('.pager [data-page]').forEach(b=>b.onclick=()=>onChange(Number(b.dataset.page))),0);
  return html;
}

async function renderHome(){
  const pg=$("#featured-projects"), bl=$("#latest-posts"); if(!pg&&!bl)return;
  const [projects,posts]=await Promise.all([getPublishedProjects(3),getPublishedPosts(3)]);
  if(pg) pg.innerHTML=projects.length?projects.map(p=>card(p,"project")).join(""):`<div class="empty">Projects will appear here after publication.</div>`;
  if(bl) bl.innerHTML=posts.length?posts.map(p=>card(p,"post")).join(""):`<div class="empty">Writing will appear here after publication.</div>`;
}

async function renderProjects(){
  const el=$("#projects-grid"); if(!el)return;
  const requested=params.get("project");
  if(requested){await renderProjectDetail(el,requested);return}
  const items=await getPublishedProjects(100);
  const size=6;
  const draw=(page)=>{
    const start=(page-1)*size;
    const slice=items.slice(start,start+size);
    el.innerHTML=(slice.length?slice.map(p=>card(p,"project")).join(""):`<div class="empty">No published projects yet.</div>`)+pager(items.length,page,size,draw);
  };
  draw(1);
}

async function renderBlog(){
  const el=$("#blog-grid"); if(!el)return;
  const requested=params.get("post");
  if(requested){await renderArticleDetail(el,requested);return}
  const items=await getPublishedPosts(100);
  const size=6;
  const draw=(page)=>{
    const start=(page-1)*size;
    const slice=items.slice(start,start+size);
    el.innerHTML=(slice.length?slice.map(p=>card(p,"post")).join(""):`<div class="empty">No published articles yet.</div>`)+pager(items.length,page,size,draw);
  };
  draw(1);
}

async function findBySlug(collectionName,slug){
  try{
    const q=query(collection(db,collectionName),where("slug","==",slug),where("published","==",true),limit(1));
    const s=await getDocs(q);
    if(s.docs[0]) return s.docs[0];
    const byId=await getDoc(doc(db,collectionName,slug));
    return byId.exists() && byId.data().published===true ? byId : null;
  }catch(e){console.error(e);return null}
}

function articleMarkup(p){
  return `<div class="article-detail-head">
    <div class="article-detail-cover">${p.coverUrl?`<img src="${esc(p.coverUrl)}" alt="${esc(p.title||'Article cover')}">`:'<div class="cover-placeholder">Article cover</div>'}</div>
    <div class="article-detail-copy">
      <div class="detail-meta"><span>${esc(p.category||"Journal")}</span><span>${esc(p.readTime||"")}</span></div>
      <h1>${esc(p.title||"Untitled")}</h1>
      <p class="lede">${esc(p.excerpt||"")}</p>
    </div>
  </div><div class="rich-content article-rich-content">${p.contentHtml||""}</div>`;
}

async function renderArticleDetail(el,slug){
  const snap=await findBySlug("posts",slug);
  if(!snap){el.innerHTML="<div class='empty'>Article not found.</div>";return}
  const p={id:snap.id,...snap.data()};
  el.className="article-detail-wrap";
  el.innerHTML=articleMarkup(p);
  document.title=`${p.title} — Kafi Abdullah`;
}

async function renderProjectDetail(el,slug){
  const snap=await findBySlug("projects",slug);
  if(!snap){el.innerHTML="<div class='empty'>Project not found.</div>";return}
  const p={id:snap.id,...snap.data()};
  el.className="project-detail-wrap";
  el.innerHTML=`<div class="detail-hero"><div class="detail-cover">${p.coverUrl?`<img src="${esc(p.coverUrl)}" alt="${esc(p.title||'Project cover')}">`:''}</div><div class="detail-copy"><p class="kicker">${esc(p.label||"PROJECT")}</p><h1>${esc(p.title||"Untitled")}</h1><p class="lede">${esc(p.description||"")}</p>${p.projectUrl?`<a class="button button-dark" href="${esc(p.projectUrl)}" target="_blank" rel="noopener">Visit project ↗</a>`:""}</div></div><div class="rich-content">${p.contentHtml||""}</div>`;
  document.title=`${p.title} — Kafi Abdullah`;
}

async function renderStandaloneArticle(){
  const el=$("#article-detail");
  if(!el)return;
  const requested=params.get("post");
  if(!requested){el.innerHTML="<div class=\"empty\">Please open this article from the Blog page.</div>";return}
  await renderArticleDetail(el,requested);
}

async function initContact(){
  const form=$("#contact-form"); if(!form)return;
  form.addEventListener("submit",async e=>{
    e.preventDefault();const b=form.querySelector("button"),status=$("#form-status");b.disabled=true;status.textContent="Sending…";
    const fd=new FormData(form);
    try{await addDoc(collection(db,"messages"),{name:fd.get("name"),email:fd.get("email"),phone:fd.get("phone")||"",message:fd.get("message"),status:"new",createdAt:serverTimestamp()});form.reset();status.textContent="Message sent. Thank you — I’ll get back to you.";}
    catch(err){console.error(err);status.textContent="Could not send the message. Please email me directly.";} finally{b.disabled=false}
  });
}

const page=document.body.dataset.page;
if(page==="home")renderHome();
if(page==="projects")renderProjects();
if(page==="project"){ const el=$("#project-detail"); if(el) renderProjectDetail(el, params.get("project")||""); }
if(page==="blog")renderBlog();
if(page==="article")renderStandaloneArticle();
if(page==="contact")initContact();
