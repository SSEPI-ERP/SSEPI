import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import logoImg from "../public/logo.png";

/* ══════════════════════════════
   CHATBOT DATA & ENGINE
══════════════════════════════ */
interface Msg { id: number; from: "bot" | "user"; text: string; time: string; }
interface BotRule { kw: string[]; reply: string; quick?: string[]; }

const BOT_RULES: BotRule[] = [
  {
    kw: ["hola", "buen", "saludos", "hi", "buenas", "inicio", "empezar"],
    reply: "¡Buen día! Soy el asistente virtual de SSEPI. Estoy aquí para orientarle sobre nuestros servicios, ubicación y contacto.\n\n¿En qué le puedo ayudar?",
    quick: ["Servicios", "Cotización", "Contacto", "Ubicación"],
  },
  {
    kw: ["servicio", "que hacen", "ofrecen", "trabajan", "realizan", "especialidad"],
    reply: "SSEPI ofrece 5 líneas de servicio especializadas:\n\n• 🔧 Reparación Industrial\n• ⚙️ Automatización\n• 💻 Programación PLC/HMI\n• 📐 Diseño e Ingeniería\n• 👁 Visión Artificial\n\n¿Le gustaría detalles sobre alguno?",
    quick: ["Reparación", "Automatización", "Programación", "Visión Artificial"],
  },
  {
    kw: ["reparaci", "tarjeta", "servodrive", "variador", "arrancador", "hmi", "teach", "corona"],
    reply: "En **Reparación Industrial** atendemos:\n\n• Tarjetas electrónicas industriales\n• Servodrives y variadores de frecuencia\n• PLCs y controladores lógicos\n• Interfaces HMI y Teach Pendant\n• Arrancadores suaves\n• Controladores de flama\n• Tratadoras Corona\n\nUrgencias resueltas en 24–48 horas con diagnóstico sin costo previo.",
    quick: ["Cotización", "Contacto directo", "Garantía"],
  },
  {
    kw: ["automatizaci", "sistema", "falla", "respaldo", "scada", "integra"],
    reply: "Nuestros servicios de **Automatización** incluyen:\n\n• Diagnóstico y solución de fallas en sistemas automatizados\n• Respaldo y documentación de programas PLC/HMI\n• Capacitación técnica al personal de mantenimiento\n• Soporte preventivo y correctivo\n• Mejora continua y actualización de software de control",
    quick: ["Programación", "Cotización", "Contacto directo"],
  },
  {
    kw: ["program", "plc", "pid", "profibus", "profinet", "modbus", "siemens", "allen", "omron", "delta"],
    reply: "En **Programación Industrial** trabajamos con:\n\n• PLCs Siemens, Allen-Bradley, Delta, Omron y más\n• HMI táctiles y paneles de operador\n• SCADA para monitoreo y registro de variables\n• Lazos PID: temperatura, velocidad y presión\n• Redes industriales: PROFINET, PROFIBUS, MODBUS, ETHERNET/IP\n• Migración de plataformas obsoletas",
    quick: ["Diseño e Ingeniería", "Cotización", "Contacto directo"],
  },
  {
    kw: ["diseño", "ingenieria", "ingeniería", "arquitectura", "sensor", "actuador", "diagrama", "documentaci"],
    reply: "En **Diseño e Ingeniería** le ofrecemos:\n\n• Proyectos de automatización y control industrial\n• Arquitecturas PLC–HMI–SCADA\n• Selección e integración de sensores y actuadores\n• Diagramas eléctricos y documentación técnica completa",
    quick: ["Visión Artificial", "Cotización", "Contacto directo"],
  },
  {
    kw: ["visi", "camara", "cámara", "inspecci", "calidad", "defecto", "imagen", "optico", "óptico"],
    reply: "En **Visión Artificial** implementamos:\n\n• Sistemas de inspección por cámara para control de calidad en línea\n• Integración de cámaras industriales, sensores ópticos e iluminación especializada\n• Detección de defectos, lectura de códigos y medición dimensional\n• Algoritmos de procesamiento de imagen\n• Comunicación directa con PLC y SCADA para rechazos automáticos y trazabilidad",
    quick: ["Cotización", "Contacto directo"],
  },
  {
    kw: ["cotiz", "precio", "costo", "cuánto", "cuanto", "presupuesto"],
    reply: "Ofrecemos **diagnóstico técnico sin costo** en todos los trabajos de reparación.\n\nPara proyectos de automatización, programación o diseño, elaboramos una cotización formal sin compromiso.\n\n¿Desea que le contactemos para enviarle una propuesta?",
    quick: ["Sí, contáctenme", "Llamar ahora", "Enviar correo"],
  },
  {
    kw: ["contacto", "hablar", "comunicar", "agendar", "cita"],
    reply: "Puede contactarnos a través de los siguientes medios:\n\n📞 **Tel:** 477 737 3118\n📧 **Email:** ssepiventas@gmail.com\n📍 **Dirección:** Blvd. Zodiaco 336, Los Limones, León, Gto.\n\n¿Prefiere que le llamemos o ir directamente al formulario de contacto?",
    quick: ["Llamar ahora", "Formulario de contacto", "¿Dónde están?"],
  },
  {
    kw: ["llamar", "teléfono", "telefono", "llamen", "llama", "número"],
    reply: "Puede llamarnos directamente al:\n\n📞 **477 737 3118**\n\nAtendemos en horario laboral. Para urgencias industriales contamos con atención prioritaria en 24–48 horas.",
    quick: ["Formulario de contacto", "¿Dónde están?"],
  },
  {
    kw: ["formulario", "form", "mensaje", "escribir"],
    reply: "Puede enviarnos un mensaje a través de nuestro formulario de contacto en la sección inferior de esta página. Respondemos en menos de 24 horas en días hábiles.",
    quick: ["Ver formulario", "Llamar ahora"],
  },
  {
    kw: ["ver formulario"],
    reply: "Le redirijo a la sección de contacto 👇",
    quick: [],
  },
  {
    kw: ["correo", "email", "mail"],
    reply: "Puede escribirnos directamente a:\n\n📧 **ssepiventas@gmail.com**\n\nIndique su nombre, empresa (si aplica) y el equipo o servicio requerido para atenderle con mayor rapidez.",
    quick: ["Llamar ahora", "Formulario de contacto"],
  },
  {
    kw: ["dónde", "donde", "ubicaci", "dirección", "direccion", "domicilio", "leon", "bajío", "bajio"],
    reply: "Estamos ubicados en:\n\n📍 **Blvd. Zodiaco 336, Los Limones C.P. 37448, León, Gto.**\n\nAtendemos también en: Guadalajara, Querétaro y San Luis Potosí con servicio de recolección y entrega en planta.",
    quick: ["Contacto", "Servicios"],
  },
  {
    kw: ["garantía", "garantia", "garantizan", "respaldan"],
    reply: "Sí. **Garantizamos el 100% de nuestros trabajos.** Entregamos reportes escritos y fotográficos de cada intervención como respaldo documental para su área de mantenimiento.",
    quick: ["Cotización", "Contacto directo"],
  },
  {
    kw: ["urgencia", "urgente", "rapido", "rápido", "emergencia", "tiempo"],
    reply: "Para **urgencias industriales**, atendemos con tiempo de respuesta de **24 a 48 horas**. Contamos con servicio de recolección y entrega directa en planta para minimizar tiempos de paro.",
    quick: ["Llamar ahora", "Cotización"],
  },
  {
    kw: ["sí, contáctenme", "contactenme", "si contacten"],
    reply: "Perfecto. ¿Podría indicarnos su nombre y empresa para que nuestro equipo le contacte a la brevedad? También puede ir directamente al formulario.",
    quick: ["Formulario de contacto", "Llamar ahora"],
  },
  {
    kw: ["gracias", "thank", "perfecto", "excelente", "listo"],
    reply: "Ha sido un placer orientarle. Estamos a sus órdenes para cualquier consulta adicional. ¡Que tenga un excelente día!",
    quick: ["Servicios", "Contacto"],
  },
];

function matchBot(input: string): BotRule | null {
  const q = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const rule of BOT_RULES) {
    if (rule.kw.some(k => q.includes(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return rule;
  }
  return null;
}

function now() {
  return new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

const WELCOME: Msg = {
  id: 0, from: "bot", time: now(),
  text: "¡Buen día! Soy el asistente virtual de SSEPI. Estoy aquí para orientarle sobre nuestros servicios, ubicación y formas de contacto.\n\n¿En qué le puedo ayudar?",
};

function ChatBot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [quick, setQuick] = useState<string[]>(["Servicios", "Cotización", "Contacto", "Ubicación"]);
  const [notif, setNotif] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  let idRef = useRef(1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  const sendMsg = useCallback((text: string) => {
    if (!text.trim()) return;
    const userMsg: Msg = { id: idRef.current++, from: "user", text, time: now() };
    setMsgs(p => [...p, userMsg]);
    setInput("");
    setQuick([]);
    setNotif(false);
    setTyping(true);

    const lower = text.toLowerCase();
    const isFormLink = lower.includes("ver formulario");
    const isCall = lower.includes("llamar ahora");

    setTimeout(() => {
      setTyping(false);
      const rule = matchBot(text);
      const replyText = rule
        ? rule.reply
        : "Entendido. Para darle una respuesta más precisa, le recomiendo contactarnos directamente al **477 737 3118** o por correo a **ssepiventas@gmail.com**.";
      const botMsg: Msg = { id: idRef.current++, from: "bot", text: replyText, time: now() };
      setMsgs(p => [...p, botMsg]);
      setQuick(rule?.quick ?? ["Servicios", "Contacto"]);

      if (isFormLink) {
        setTimeout(() => {
          document.getElementById("contacto")?.scrollIntoView({ behavior: "smooth" });
        }, 400);
      }
      if (isCall) {
        setTimeout(() => { window.open("tel:4777373118"); }, 600);
      }
    }, 900 + Math.random() * 500);
  }, []);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendMsg(input);
  };

  const renderText = (t: string) =>
    t.split("**").map((seg, i) =>
      i % 2 === 1 ? <strong key={i} style={{ color: "#00d97e" }}>{seg}</strong> : <span key={i}>{seg}</span>
    );

  return (
    <>
      <button className="chat-fab" onClick={() => { setOpen(v => !v); setNotif(false); }} aria-label="Asistente SSEPI">
        {notif && <span className="notif">1</span>}
        {open
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        }
      </button>

      <div className={`chat-panel${open ? " open" : ""}`} role="dialog" aria-label="Asistente SSEPI">
        <div className="chat-header">
          <div className="chat-avatar">🤖</div>
          <div className="chat-hinfo">
            <div className="chat-hname">Asistente SSEPI</div>
            <div className="chat-hstatus">En línea · Respuesta inmediata</div>
          </div>
          <button className="chat-close" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
        </div>

        <div className="chat-msgs">
          {msgs.map(m => (
            <div key={m.id} className={`chat-msg ${m.from}`}>
              <div>
                <div className="chat-bubble" style={{ whiteSpace: "pre-line" }}>
                  {renderText(m.text)}
                </div>
                <div className="chat-msg-time">{m.time}</div>
              </div>
            </div>
          ))}
          {typing && (
            <div className="chat-msg bot">
              <div className="chat-bubble">
                <div className="chat-typing"><span/><span/><span/></div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {quick.length > 0 && (
          <div className="chat-quick">
            {quick.map(q => (
              <button key={q} className="chat-quick-btn" onClick={() => sendMsg(q)}>{q}</button>
            ))}
          </div>
        )}

        <div className="chat-input-row">
          <input
            className="chat-input"
            placeholder="Escriba su consulta…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button className="chat-send" onClick={() => sendMsg(input)} aria-label="Enviar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

/* ── PARTICLES ENGINE ── */
function ParticlesCanvas({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;

    const P: { x: number; y: number; vx: number; vy: number; r: number; alpha: number }[] = [];
    const N = 70;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < N; i++) {
      P.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - .5) * .35,
        vy: (Math.random() - .5) * .35,
        r: Math.random() * 1.5 + .5,
        alpha: Math.random() * .5 + .3,
      });
    }

    function frame() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of P) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,217,126,${p.alpha})`;
        ctx.fill();
      }
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(P[i].x, P[i].y);
            ctx.lineTo(P[j].x, P[j].y);
            ctx.strokeStyle = `rgba(26,143,227,${.1 * (1 - d / 110)})`;
            ctx.lineWidth = .6;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }
    frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [canvasRef]);
  return null;
}

/* ── TYPEWRITER ── */
const WORDS = ["SOLUCIONES ELECTRÓNICAS", "AUTOMATIZACIÓN INDUSTRIAL", "REPARACIÓN PROFESIONAL", "SSEPI"];
function useTypewriter() {
  const [text, setText] = useState("");
  const state = useRef({ wi: 0, ci: 0, del: false });

  useEffect(() => {
    const s = state.current;
    const word = WORDS[s.wi];
    let delay = s.del ? 38 : 72;
    if (!s.del && s.ci === word.length) delay = 2000;
    if (s.del && s.ci === 0) delay = 350;

    const t = setTimeout(() => {
      if (!s.del) {
        if (s.ci < word.length) { setText(word.slice(0, ++s.ci)); }
        else { s.del = true; }
      } else {
        if (s.ci > 0) { setText(word.slice(0, --s.ci)); }
        else { s.del = false; s.wi = (s.wi + 1) % WORDS.length; }
      }
    }, delay);
    return () => clearTimeout(t);
  });
  return text;
}

/* ── ANIMATED COUNTER ── */
function ACounter({ to, suffix }: { to: number; suffix: string }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        const dur = 1400, steps = 50;
        let i = 0;
        const id = setInterval(() => {
          i++;
          setV(Math.round(to * (i / steps)));
          if (i >= steps) clearInterval(id);
        }, dur / steps);
      }
    }, { threshold: .5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to]);

  return <span ref={ref} className="counter-num">{v}<span className="counter-sfx">{suffix}</span></span>;
}

/* ── REVEAL OBSERVER ── */
function useReveal() {
  useEffect(() => {
    const all = document.querySelectorAll(".reveal,.reveal-left,.reveal-right,.section-rule");
    const obs = new IntersectionObserver(
      (es) => es.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: .1 }
    );
    all.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

/* ── WHY CARD STAGGER ── */
function useWhyCards() {
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(".why-card");
    const obs = new IntersectionObserver(
      (es) => es.forEach(e => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          setTimeout(() => el.classList.add("visible"), +(el.dataset.d ?? 0));
        }
      }), { threshold: .1 }
    );
    cards.forEach(c => obs.observe(c));
    return () => obs.disconnect();
  }, []);
}

/* ════════════════════════════
   APP
════════════════════════════ */
export default function App() {
  const [light, setLight] = useState(() => localStorage.getItem("ssepi-t") === "1");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tab, setTab] = useState("t1");
  const [loaded, setLoaded] = useState(false);
  const [btt, setBtt] = useState(false);
  const [toast, setToast] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ n: "", t: "", e: "", c: "", a: "", m: "" });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tw = useTypewriter();

  useReveal();
  useWhyCards();

  // Preloader
  useEffect(() => { const id = setTimeout(() => setLoaded(true), 1900); return () => clearTimeout(id); }, []);

  // Apply theme to body
  useEffect(() => {
    document.body.className = light ? "light" : "";
    localStorage.setItem("ssepi-t", light ? "1" : "0");
  }, [light]);

  // Scroll
  useEffect(() => {
    const fn = () => { setScrolled(window.scrollY > 60); setBtt(window.scrollY > 400); };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const send = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setToast(true);
      setForm({ n: "", t: "", e: "", c: "", a: "", m: "" });
      setTimeout(() => setToast(false), 3600);
    }, 1500);
  }, []);

  const f = (k: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: ev.target.value }));

  const WHY = [
    { n: "01", t: "Atención Inmediata" },
    { n: "02", t: "Garantía Del Trabajo" },
    { n: "03", t: "Diagnóstico Sin Costo" },
    { n: "04", t: "Precios Accesibles" },
    { n: "05", t: "Reportes Escritos y Fotográficos En Cada Trabajo" },
    { n: "06", t: "Trabajo 100% Profesional" },
    { n: "07", t: "Urgencias: 24 a 48 Hrs de Reparación" },
    { n: "08", t: "Recolección y Entrega Directa En Planta" },
    { n: "09", t: "Facilidad De Otorgar Crédito Si Se Necesita" },
    { n: "10", t: "Personal Calificado Para Cada Solicitud" },
  ];

  const TABS = [["t1", "Reparación Industrial"], ["t2", "Automatización"], ["t3", "Programación"], ["t4", "Diseño e Ingeniería"], ["t5", "Visión Artificial"]];

  const SVC = [
    ["💾", "Tarjetas Electrónicas"], ["⚙️", "Servodrives"], ["🖥", "PLCs – Controladores Lógicos"],
    ["🎛", "Variadores de Frecuencia"], ["🔥", "Controladores de Flama"], ["📺", "Interfaces HMI"],
    ["🔌", "Arrancadores Suaves"], ["🤖", "Teach Pendant"], ["⚡", "Tratadoras Corona"],
  ];

  const STEPS = ["Diagnóstico y Evaluación Técnica", "Reparación de Equipos", "Pruebas y Validación", "Soporte y Garantía"];

  const TAB2 = ["Diagnóstico y solución de fallas en sistemas automatizados", "Respaldo y documentación de programas PLC/HMI", "Capacitación técnica al personal de mantenimiento", "Servicios de mejora continua y actualización de software de control", "Soporte y mantenimiento preventivo y correctivo"];
  const TAB3 = ["Programación de PLC Siemens, Allen-Bradley, Delta, Omron, entre otros", "Configuración e implementación de interfaces HMI y pantallas táctiles", "Creación de sistemas SCADA para monitoreo y registro de variables", "Ajuste y optimización de lazos PID: temperatura, velocidad y presión", "Redes industriales: PROFINET, PROFIBUS, MODBUS, ETHERNET/IP", "Comunicación M2M y sistemas de gestión entre máquinas", "Migración y modernización de equipos obsoletos a nuevas plataformas"];
  const TAB4 = ["Desarrollo de proyectos de automatización y control industrial", "Diseño de arquitecturas PLC – HMI – SCADA", "Selección e integración de sensores, actuadores y variadores de frecuencia", "Elaboración de diagramas eléctricos y documentación técnica completa"];
  const TAB5 = ["Diseño e implementación de sistemas de inspección por cámara para control de calidad en línea", "Integración de sensores ópticos, cámaras industriales y sistemas de iluminación para detección de defectos, lectura de códigos o medición dimensional", "Procesamiento de imagen y análisis automático con algoritmos de visión artificial", "Comunicación directa con PLC y sistemas SCADA para rechazos automáticos y trazabilidad"];

  return (
    <>
      {/* PRELOADER */}
      <div id="preloader" className={loaded ? "hide" : ""}>
        <div className="pre-logo">SSEPI</div>
        <div className="pre-sub">Soluciones y Servicios Electrónicos Profesionales</div>
        <div className="pre-track">
          <div className="pre-glow" />
        </div>
      </div>

      {/* TOAST */}
      <div className={`toast-wrap${toast ? " show" : ""}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        Mensaje enviado. Te contactamos pronto.
      </div>

      {/* BACK TO TOP */}
      <button id="btt" className={btt ? "show" : ""} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Volver arriba">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
      </button>

      {/* CHATBOT */}
      <ChatBot />

      {/* ── NAVBAR ── */}
      <nav className={scrolled ? "scrolled" : ""}>
        <a href="#hero" className="nav-logo">
          <img src={logoImg} alt="SSEPI logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
          <span className="accent">SSE</span>PI
        </a>

        <ul className="nav-links">
          {[["#historia", "Historia"], ["#servicios", "Servicios"], ["#vision", "Misión & Visión"], ["#contacto", "Contacto"]].map(([h, l]) => (
            <li key={h}><a href={h}>{l}</a></li>
          ))}
        </ul>

        <div className="nav-right">
          {/* ─ THEME TOGGLE ─ */}
          <button
            className="theme-toggle"
            onClick={() => setLight(v => !v)}
            aria-label={light ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
            title={light ? "Modo oscuro" : "Modo claro"}
          >
            {/* Moon icon (left, shows in dark mode) */}
            <svg className="icon-moon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a8fe3" strokeWidth="2.5">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            <div className="knob">
              {light
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </div>
            {/* Sun icon (right, shows in dark mode) */}
            <svg className="icon-sun" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={light ? "#000" : "#7a7a9a"} strokeWidth="2">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </button>

          <button className={`hamburger${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(v => !v)}>
            <span/><span/><span/>
          </button>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu${mobileOpen ? " open" : ""}`}>
        {[["#historia", "Historia"], ["#servicios", "Servicios"], ["#vision", "Visión"], ["#contacto", "Contacto"]].map(([h, l]) => (
          <a key={h} href={h} onClick={() => setMobileOpen(false)}>{l}</a>
        ))}
        <button className="theme-toggle" onClick={() => setLight(v => !v)} style={{ marginTop: "1rem" }}>
          <svg className="icon-moon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a8fe3" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <div className="knob">
            {light ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/></svg>
                   : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </div>
          <svg className="icon-sun" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7a7a9a" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg>
        </button>
      </div>

      {/* ── HERO ── */}
      <section id="hero">
        <canvas ref={canvasRef} id="particles-canvas" />
        <ParticlesCanvas canvasRef={canvasRef} />
        <div className="hero-gradient" />
        <div className="hero-content">
          <div className="hero-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#00d97e"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Fundada en León, Gto. — 2023
          </div>
          <h1 className="hero-title">
            {tw || "\u00a0"}
            <span className="tw-cursor" />
          </h1>
          <p className="hero-sub">Bajío &nbsp;·&nbsp; Guadalajara &nbsp;·&nbsp; Querétaro &nbsp;·&nbsp; San Luis Potosí</p>
          <div className="hero-btns">
            <a href="#servicios" className="btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Nuestros Servicios
            </a>
            <a href="#contacto" className="btn-outline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Contáctanos
            </a>
            <a href="./panel/login.html" className="btn-erp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Acceso ERP
            </a>
          </div>
        </div>
        <div className="scroll-hint">
          <span>Scroll</span>
          <div className="scroll-mouse"><div className="scroll-wheel" /></div>
        </div>
      </section>

      {/* ── HISTORIA ── */}
      <section id="historia" className="grid-bg">
        <div className="section-glow" />
        <div className="amb-orb g" style={{ width:600, height:400, top:"10%", left:"-10%" }} />
        <div className="amb-orb b" style={{ width:400, height:300, bottom:"5%", right:"-5%" }} />
        <div className="container">
          <div className="historia-grid">
            <div>
              <p className="section-eyebrow reveal">Nuestra historia</p>
              <h2 className="section-title reveal d1">¿Quiénes <em>somos</em>?</h2>
              <div className="section-rule reveal d2" />
              <p className="text-body reveal d2">
                SSEPI se constituye como una empresa a partir de identificar las necesidades del sector industrial — reparaciones electrónicas, proyectos de automatización, reparaciones a motores y servomotores — en una sola empresa que pueda ofrecer estos servicios de manera profesional.
              </p>
              <br />
              <p className="text-body reveal d3">
                En el <strong style={{ color: "var(--orange)", fontWeight: 500 }}>2023</strong> se funda en <strong style={{ color: "var(--white)", fontWeight: 500 }}>LEÓN, GTO.</strong> logrando rápidamente su crecimiento, fortalecido por sus siglas que lo identifican ofreciendo <strong style={{ color: "var(--white)", fontWeight: 500 }}>Soluciones y Servicios Electrónicos Profesionales Industriales</strong> en la Zona del Bajío, Guadalajara, Querétaro y San Luis Potosí.
              </p>
            </div>
            <div className="pcb-wrap reveal-right">
              <svg viewBox="0 0 400 340" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ maxWidth: 400, width: "100%", filter: "drop-shadow(0 0 20px rgba(26,143,227,0.1))" }}>
                <rect x="50" y="50" width="300" height="240" rx="6" fill="#081210" stroke="rgba(0,217,126,0.18)" strokeWidth="1"/>
                {/* Traces */}
                <line x1="90" y1="100" x2="170" y2="100" stroke="rgba(0,217,126,0.65)" strokeWidth="1.5" className="pcb-o"/>
                <line x1="170" y1="100" x2="170" y2="150" stroke="rgba(0,217,126,0.65)" strokeWidth="1.5" className="pcb-o"/>
                <line x1="170" y1="150" x2="260" y2="150" stroke="rgba(26,143,227,0.65)" strokeWidth="1.5" className="pcb-b"/>
                <line x1="260" y1="150" x2="260" y2="100" stroke="rgba(26,143,227,0.65)" strokeWidth="1.5" className="pcb-b"/>
                <line x1="260" y1="100" x2="320" y2="100" stroke="rgba(0,217,126,0.65)" strokeWidth="1.5" className="pcb-o"/>
                <line x1="90" y1="220" x2="320" y2="220" stroke="rgba(26,143,227,0.4)" strokeWidth="1.5" className="pcb-b"/>
                <line x1="130" y1="100" x2="130" y2="220" stroke="rgba(0,217,126,0.15)" strokeWidth="1"/>
                <line x1="200" y1="70" x2="200" y2="240" stroke="rgba(26,143,227,0.15)" strokeWidth="1"/>
                <line x1="290" y1="100" x2="290" y2="220" stroke="rgba(0,217,126,0.15)" strokeWidth="1"/>
                {/* IC Chip */}
                <rect x="162" y="158" width="76" height="50" rx="3" fill="#061a12" stroke="rgba(26,143,227,0.5)" strokeWidth="1"/>
                <rect x="168" y="164" width="64" height="38" rx="2" fill="#041008" stroke="rgba(26,143,227,0.2)" strokeWidth=".5"/>
                {[170,184,198,212,226].map((x,i) => <line key={i} x1={x} y1="208" x2={x} y2="214" stroke="rgba(26,143,227,0.4)" strokeWidth=".8"/>)}
                {[170,184,198,212,226].map((x,i) => <line key={i} x1={x} y1="152" x2={x} y2="158" stroke="rgba(26,143,227,0.4)" strokeWidth=".8"/>)}
                <text x="200" y="187" fontFamily="monospace" fontSize="7" fill="#1a8fe3" textAnchor="middle" opacity=".8">SSEPI-01</text>
                <text x="200" y="198" fontFamily="monospace" fontSize="5" fill="#1a8fe3" textAnchor="middle" opacity=".5">PLC</text>
                {/* Pads */}
                {[{ cx: 90, cy: 100, c: "#00d97e" }, { cx: 170, cy: 100, c: "rgba(0,217,126,.5)" }, { cx: 260, cy: 100, c: "rgba(26,143,227,.5)" }, { cx: 320, cy: 100, c: "#1a8fe3" }, { cx: 90, cy: 220, c: "#00d97e" }, { cx: 320, cy: 220, c: "#1a8fe3" }, { cx: 170, cy: 150, c: "rgba(0,217,126,.5)" }, { cx: 260, cy: 150, c: "rgba(26,143,227,.5)" }].map((p, i) => (
                  <circle key={i} cx={p.cx} cy={p.cy} r="4" fill={p.c} />
                ))}
                {/* Resistors */}
                <rect x="186" y="92" width="28" height="11" rx="2" fill="#081a12" stroke="rgba(0,217,126,.4)" strokeWidth=".8"/>
                <rect x="108" y="154" width="11" height="28" rx="2" fill="#081a12" stroke="rgba(26,143,227,.4)" strokeWidth=".8"/>
                <rect x="282" y="154" width="11" height="24" rx="2" fill="#081a12" stroke="rgba(0,217,126,.4)" strokeWidth=".8"/>
                {/* Corners */}
                {[[50,60,70,60,50,80],[350,60,330,60,350,80],[50,280,70,280,50,260],[350,280,330,280,350,260]].map(([x1,y1,x2,y2,x3,y3],i)=>(
                  <polyline key={i} points={`${x1},${y1} ${x2},${y2}`} stroke="#00d97e" strokeWidth="1.5"/>
                ))}
                <polyline points="50,60 50,80" stroke="#00d97e" strokeWidth="1.5"/>
                <polyline points="350,60 350,80" stroke="#00d97e" strokeWidth="1.5"/>
                <polyline points="50,280 50,260" stroke="#00d97e" strokeWidth="1.5"/>
                <polyline points="350,280 350,260" stroke="#00d97e" strokeWidth="1.5"/>
                <polyline points="60,50 80,50" stroke="#00d97e" strokeWidth="1.5"/>
                <polyline points="330,50 350,50" stroke="#00d97e" strokeWidth="1.5"/>
                <polyline points="60,290 80,290" stroke="#00d97e" strokeWidth="1.5"/>
                <polyline points="330,290 350,290" stroke="#00d97e" strokeWidth="1.5"/>
              </svg>
            </div>
          </div>

          {/* WHY */}
          <div className="why-label reveal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#00d97e"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ¿Por qué elegirnos?
          </div>
          <div className="why-grid">
            {WHY.map(({ n, t }, i) => (
              <div key={n} className="why-card" data-d={i * 60}>
                <div className="why-num">{n}</div>
                <div className="why-text">{t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COUNTERS ── */}
      <section id="counters">
        <div className="container">
          <div className="counters-grid">
            {[
              { icon: "📅", to: 2, s: "+", l: "Años de experiencia" },
              { icon: "⭐", to: 100, s: "%", l: "Satisfacción garantizada" },
              { icon: "📍", to: 4, s: "", l: "Regiones atendidas" },
              { icon: "⏰", to: 24, s: "h", l: "Respuesta en urgencias" },
            ].map(({ icon, to, s, l }) => (
              <div key={l} className="counter-item reveal">
                <span className="counter-icon">{icon}</span>
                <ACounter to={to} suffix={s} />
                <div className="counter-label">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICIOS ── */}
      <section id="servicios" className="grid-bg">
        <div className="section-glow" style={{ top:"20%", background:"radial-gradient(ellipse at center, rgba(26,143,227,.08) 0%, transparent 70%)" }} />
        <div className="amb-orb b" style={{ width:500, height:350, top:"0%", right:"-8%" }} />
        <div className="amb-orb g" style={{ width:350, height:250, bottom:"10%", left:"-5%" }} />
        <div className="container">
          <p className="section-eyebrow reveal">Lo que hacemos</p>
          <h2 className="section-title reveal d1">Nuestros <em>Servicios</em></h2>
          <div className="section-rule reveal d2" />
          <div className="tabs">
            {TABS.map(([id, lb]) => (
              <button key={id} className={`tab-btn${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>{lb}</button>
            ))}
          </div>

          <div className={`tab-panel${tab === "t1" ? " active" : ""}`}>
            <div className="service-grid">
              {SVC.map(([icon, txt]) => (
                <div key={txt} className="service-card">
                  <span className="sicon">{icon}</span>
                  <p>{txt}</p>
                </div>
              ))}
            </div>
            <p className="section-eyebrow" style={{ marginBottom: "1.4rem" }}>Proceso de reparación</p>
            <div className="steps-row">
              {STEPS.map((s, i) => (
                <div key={i} className="step">
                  <div className="step-dot">0{i + 1}</div>
                  <p>{s}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={`tab-panel${tab === "t2" ? " active" : ""}`}>
            <ul className="list-styled">{TAB2.map(t => <li key={t}>{t}</li>)}</ul>
          </div>
          <div className={`tab-panel${tab === "t3" ? " active" : ""}`}>
            <ul className="list-styled">{TAB3.map(t => <li key={t}>{t}</li>)}</ul>
          </div>
          <div className={`tab-panel${tab === "t4" ? " active" : ""}`}>
            <ul className="list-styled">{TAB4.map(t => <li key={t}>{t}</li>)}</ul>
          </div>
          <div className={`tab-panel${tab === "t5" ? " active" : ""}`}>
            <ul className="list-styled">{TAB5.map(t => <li key={t}>{t}</li>)}</ul>
          </div>
        </div>
      </section>

      {/* ── VISIÓN & MISIÓN ── */}
      <section id="vision" style={{ position:"relative", overflow:"hidden" }}>
        <div className="section-glow" style={{ background:"radial-gradient(ellipse at center, rgba(0,217,126,.09) 0%, transparent 70%)" }} />
        <div className="amb-orb g" style={{ width:700, height:400, top:"-10%", right:"-15%" }} />
        <div className="amb-orb b" style={{ width:400, height:300, bottom:"5%", left:"-8%" }} />
        <div className="container">
          <p className="section-eyebrow reveal">Nuestra esencia</p>
          <h2 className="section-title reveal d1">Misión <em>&amp;</em> Visión</h2>
          <div className="section-rule reveal d2" />
          <div className="mv-grid">
            <div className="flip-card reveal">
              <div className="flip-inner">
                <div className="flip-front">
                  <span className="ff-icon">🎯</span>
                  <h3>MISIÓN</h3>
                  <p className="hint">Pasa el cursor para leer</p>
                </div>
                <div className="flip-back">
                  <h3>MISIÓN</h3>
                  <p>Proporcionar soluciones profesionales y eficientes, mediante técnicas de ingeniería que den como resultado la satisfacción y el arreglo de la necesidad del cliente.</p>
                </div>
              </div>
            </div>
            <div className="flip-card reveal d2">
              <div className="flip-inner">
                <div className="flip-front">
                  <span className="ff-icon">👁</span>
                  <h3>VISIÓN</h3>
                  <p className="hint">Pasa el cursor para leer</p>
                </div>
                <div className="flip-back">
                  <h3>VISIÓN</h3>
                  <p>Ser una empresa con sentido y carácter profesional, competitiva en el mercado nacional, que brinde soluciones técnicas en el desarrollo de múltiples servicios orientados al área electrónica, motores y automatización.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="blockquote reveal">
            <span className="bq-mark">"</span>
            <p>"La calidad del servicio y la atención al cliente son nuestra prioridad."</p>
            <cite>— Yusel Valdez, Cofundador SSEPI</cite>
          </div>
        </div>
      </section>

      {/* ── CONTACTO ── */}
      <section id="contacto" className="grid-bg">
        <div className="section-glow" style={{ background:"radial-gradient(ellipse at center, rgba(26,143,227,.07) 0%, transparent 70%)" }} />
        <div className="amb-orb b" style={{ width:600, height:400, top:"-5%", left:"-10%" }} />
        <div className="amb-orb g" style={{ width:450, height:300, bottom:"0%", right:"-8%" }} />
        <div className="container">
          <p className="section-eyebrow reveal">Hablemos</p>
          <h2 className="section-title reveal d1">Contáctanos</h2>
          <div className="section-rule reveal d2" />
          <div className="contacto-grid">
            <div>
              {[
                { icon: "📍", lb: "Ubicación", val: "Blvd. Zodiaco 336, Los Limones C.P. 37448, León, Gto." },
                { icon: "📞", lb: "Teléfono", val: "477 737 3118", href: "tel:4777373118" },
                { icon: "📧", lb: "Correo electrónico", val: "ssepiventas@gmail.com", href: "mailto:ssepiventas@gmail.com" },
              ].map(({ icon, lb, val, href }) => (
                <div key={lb} className="info-card reveal">
                  <span className="ic-icon">{icon}</span>
                  <div>
                    <div className="ic-label">{lb}</div>
                    <div className="ic-val">{href ? <a href={href}>{val}</a> : val}</div>
                  </div>
                </div>
              ))}
              <div className="map-wrap reveal">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3721.9!2d-101.68616!3d21.12012!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x842bbf2cbb90fd99%3A0x4e01adb3bbef5c05!2sLeón%2C%20Gto.!5e0!3m2!1ses!2smx!4v1234"
                  allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="SSEPI León"
                />
              </div>
            </div>

            <form className="contact-form" onSubmit={send}>
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre *</label>
                  <input required value={form.n} onChange={f("n")} placeholder="Tu nombre completo" />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input value={form.t} onChange={f("t")} placeholder="477 000 0000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Correo electrónico *</label>
                  <input required type="email" value={form.e} onChange={f("e")} placeholder="correo@empresa.com" />
                </div>
                <div className="form-group">
                  <label>Empresa</label>
                  <input value={form.c} onChange={f("c")} placeholder="Nombre de tu empresa" />
                </div>
              </div>
              <div className="form-group">
                <label>Asunto *</label>
                <select required value={form.a} onChange={f("a")}>
                  <option value="">Selecciona un asunto…</option>
                  <option>Reparación Industrial</option>
                  <option>Automatización e Integración</option>
                  <option>Programación PLC / HMI</option>
                  <option>Diseño e Ingeniería</option>
                  <option>Sistemas de Visión Artificial</option>
                  <option>Cotización General</option>
                  <option>Otro</option>
                </select>
              </div>
              <div className="form-group">
                <label>Mensaje *</label>
                <textarea required value={form.m} onChange={f("m")} placeholder="Describe tu necesidad o consulta…" />
              </div>
              <button type="submit" className="btn-submit" disabled={sending}>
                {sending ? (
                  <><span style={{ width: 16, height: 16, border: "2px solid #000", borderTopColor: "transparent", borderRadius: "50%", display: "block", animation: "spin .6s linear infinite" }} />Enviando…</>
                ) : (
                  <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Enviar Mensaje</>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#hero" className="nav-logo" style={{ display: "inline-flex", marginBottom: ".4rem" }}>
                <img src={logoImg} alt="SSEPI logo" style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover" }} />
                <span className="accent">SSE</span>PI
              </a>
              <p>Soluciones y Servicios Electrónicos Profesionales Industriales. Fundada en León, Gto. — Atendemos el Bajío, Guadalajara, Querétaro y San Luis Potosí.</p>
              <div className="socials">
                <a href="#" aria-label="Facebook">Fb</a>
                <a href="#" aria-label="LinkedIn">Li</a>
                <a href="mailto:ssepiventas@gmail.com" aria-label="Email">@</a>
                <a href="tel:4777373118" aria-label="Teléfono">☎</a>
              </div>
            </div>
            <div className="footer-col">
              <h4>Navegación</h4>
              <ul>
                {[["#historia", "Historia"], ["#servicios", "Servicios"], ["#vision", "Misión & Visión"], ["#contacto", "Contacto"]].map(([h, l]) => (
                  <li key={h}><a href={h}>{l}</a></li>
                ))}
              </ul>
            </div>
            <div className="footer-col">
              <h4>Contacto</h4>
              <div className="ci-row"><span>📍</span><span>Blvd. Zodiaco 336, Los Limones, León, Gto.</span></div>
              <div className="ci-row"><span>📞</span><span>477 737 3118</span></div>
              <div className="ci-row"><span>📧</span><span>ssepiventas@gmail.com</span></div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2024 SSEPI — Todos los derechos reservados. Hecho en León, Gto. 🇲🇽</p>
            <p style={{ color: "var(--muted)", fontSize: ".78rem" }}>Industrial Futurista · Diseño Profesional</p>
          </div>
        </div>
      </footer>
    </>
  );
}
