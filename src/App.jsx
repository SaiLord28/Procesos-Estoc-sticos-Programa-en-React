import React, { useState, useMemo, useRef, useEffect } from "react";

// =============================================================================
//  CADENA DE MARKOV DE DOS ESTADOS  —  Analizador + Simulador
//  Estados {0, 1}, matriz P = [[1-a, a], [b, 1-b]]
//  Toda la matemática está implementada desde cero.
// =============================================================================

// ---------- utilidades numéricas ----------
const fmt = (x, d = 4) => {
  if (!isFinite(x)) return "∞";
  if (Math.abs(x) < 1e-12) return "0";
  const r = Number(x.toFixed(d));
  return Number.isInteger(r) ? String(r) : r.toFixed(d).replace(/\.?0+$/, "");
};

// Producto matriz 2x2 por vector fila [p0, p1]
const rowTimesMatrix = (v, M) => [
  v[0] * M[0][0] + v[1] * M[1][0],
  v[0] * M[0][1] + v[1] * M[1][1],
];

// Potencia exacta de P(n) usando la fórmula cerrada del libro:
// P(n) = 1/(a+b) [[b,a],[b,a]] + (1-a-b)^n/(a+b) [[a,-a],[-b,b]]
const Pn = (a, b, n) => {
  const s = a + b;
  if (s === 0) {
    // P = I, se queda en el estado inicial
    return [
      [1, 0],
      [0, 1],
    ];
  }
  const lam = Math.pow(1 - a - b, n);
  return [
    [(b + lam * a) / s, (a - lam * a) / s],
    [(b - lam * b) / s, (a + lam * b) / s],
  ];
};

export default function App() {
  const [a, setA] = useState(0.3);
  const [b, setB] = useState(0.5);
  const [tab, setTab] = useState("matriz");

  const aa = Math.min(1, Math.max(0, a));
  const bb = Math.min(1, Math.max(0, b));

  // -------- ANÁLISIS COMPLETO (memoizado) --------
  const analysis = useMemo(() => analyze(aa, bb), [aa, bb]);

  const tabs = [
    ["matriz", "Matriz P"],
    ["clases", "Clases & Estados"],
    ["periodos", "Periodos"],
    ["dist", "Distribuciones"],
    ["tiempos", "Tiempos medios"],
    ["sim", "Simulación"],
  ];

  return (
    <div className="mk-root">
      <style>{CSS}</style>

      <header className="mk-head">
        <div className="mk-head-tag">Cadenas de Markov · Proyecto</div>
        <h1>Cadena de Markov de Dos Estados</h1>
        <p className="mk-sub">
          Espacio de estados <span className="mono">{"{0, 1}"}</span> con matriz{" "}
          <span className="mono">P = [[1−a, a], [b, 1−b]]</span>
        </p>
      </header>

      {/* PARÁMETROS */}
      <section className="mk-params">
        <Param
          label="a"
          desc="P(0 → 1) · probabilidad de pasar de 0 a 1"
          value={a}
          onChange={setA}
          color="var(--c-a)"
        />
        <Param
          label="b"
          desc="P(1 → 0) · probabilidad de pasar de 1 a 0"
          value={b}
          onChange={setB}
          color="var(--c-b)"
        />
        <Diagram a={aa} b={bb} />
      </section>

      {/* TABS */}
      <nav className="mk-tabs">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            className={"mk-tab" + (tab === k ? " active" : "")}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="mk-main">
        {tab === "matriz" && <MatrizPanel a={aa} b={bb} A={analysis} />}
        {tab === "clases" && <ClasesPanel A={analysis} />}
        {tab === "periodos" && <PeriodosPanel A={analysis} />}
        {tab === "dist" && <DistPanel a={aa} b={bb} A={analysis} />}
        {tab === "tiempos" && <TiemposPanel A={analysis} />}
        {tab === "sim" && <SimPanel a={aa} b={bb} A={analysis} />}
      </main>

      <footer className="mk-foot">
        Analizador de la Cadena de Dos Estados · cálculos exactos con la fórmula
        cerrada P(n) y simulación de Monte Carlo
      </footer>
    </div>
  );
}

// ============================================================================
//  NÚCLEO MATEMÁTICO
// ============================================================================
function analyze(a, b) {
  const P = [
    [1 - a, a],
    [b, 1 - b],
  ];
  const s = a + b;

  // --- Estructura de comunicación ---
  // 0 -> 1 posible si a > 0 ;  1 -> 0 posible si b > 0
  const reach01 = a > 0;
  const reach10 = b > 0;

  let classes; // arreglo de arreglos de estados
  let scenario; // etiqueta
  if (a === 0 && b === 0) {
    // P = I : cada estado es su propia clase, ambos absorbentes
    classes = [[0], [1]];
    scenario = "identidad"; // dos absorbentes
  } else if (a === 0) {
    // 0 absorbente, 1 transitorio (1->0 pero no regresa)
    classes = [[0], [1]];
    scenario = "abs0";
  } else if (b === 0) {
    // 1 absorbente, 0 transitorio
    classes = [[0], [1]];
    scenario = "abs1";
  } else {
    // a>0 y b>0 : irreducible, una sola clase
    classes = [[0, 1]];
    scenario = "irreducible";
  }

  // --- Clasificación de estados ---
  // Estado i: recurrente si su clase es cerrada (no se puede escapar)
  const closed = classes.map((cls) => {
    // clase cerrada si ningún estado de la clase puede salir de ella
    return cls.every((st) => {
      for (let j = 0; j < 2; j++) {
        if (P[st][j] > 0 && !cls.includes(j)) return false;
      }
      return true;
    });
  });

  const stateInfo = [0, 1].map((st) => {
    const ci = classes.findIndex((c) => c.includes(st));
    const isClosed = closed[ci];
    // Cadena finita: clase recurrente => recurrente positiva.
    let kind;
    if (isClosed) kind = "recurrente positivo";
    else kind = "transitorio";
    return { state: st, classIndex: ci, kind, closed: isClosed };
  });

  // --- Periodos ---
  // periodo de un estado = mcd de los n con P^n(i,i) > 0
  const periods = [0, 1].map((st) => period(P, st));

  // --- Distribución estacionaria / límite ---
  let stationary = null; // distribución estacionaria π
  let limitMatrix = null; // lim P^n (si existe)
  let uniqueStationary = true;
  if (s > 0) {
    // π = (b/(a+b), a/(a+b)) es estacionaria siempre que a+b>0
    stationary = [b / s, a / s];
    // El límite existe si la cadena es aperiódica.
    const aper = periods[0] === 1 || periods[1] === 1 || s !== 2; // s=2 => a=b=1 => periódica
    if (s === 2) {
      // a=b=1 : matriz [[0,1],[1,0]], periódica, no hay límite
      limitMatrix = null;
    } else {
      limitMatrix = [
        [b / s, a / s],
        [b / s, a / s],
      ];
    }
  } else {
    // a=b=0 : toda distribución es estacionaria
    uniqueStationary = false;
    stationary = null;
  }

  // --- Tiempos medios de recurrencia ---
  // Para cadena irreducible positiva recurrente: m_ii = 1/π_i
  let meanRecurrence = null;
  if (scenario === "irreducible") {
    meanRecurrence = [s / b, s / a]; // 1/π0, 1/π1
  }

  // --- Tiempos medios de primer paso (hitting times) ---
  // m_{i->j} = tiempo esperado para llegar a j partiendo de i
  // m_{0->1}: desde 0. m_{0->1} = 1 + (1-a) m_{0->1}  => m = 1/a
  // m_{1->0} = 1/b
  let firstPassage = null;
  if (a > 0 && b > 0) {
    firstPassage = {
      "0->1": 1 / a,
      "1->0": 1 / b,
      "0->0": s / b, // = m_recurrence(0)
      "1->1": s / a,
    };
  }

  // --- Absorción ---
  let absorption = null;
  if (scenario === "abs0") {
    // 0 absorbente; desde 1 el tiempo medio de absorción = 1/b
    absorption = {
      absorbingStates: [0],
      transient: [1],
      meanAbsorption: { 1: 1 / b },
      note: "El estado 0 es absorbente. Partiendo de 1 se llega a 0 en promedio en 1/b pasos.",
    };
  } else if (scenario === "abs1") {
    absorption = {
      absorbingStates: [1],
      transient: [0],
      meanAbsorption: { 0: 1 / a },
      note: "El estado 1 es absorbente. Partiendo de 0 se llega a 1 en promedio en 1/a pasos.",
    };
  } else if (scenario === "identidad") {
    absorption = {
      absorbingStates: [0, 1],
      transient: [],
      meanAbsorption: {},
      note: "Ambos estados son absorbentes (P = I). La cadena nunca cambia de estado.",
    };
  }

  // --- Independencia especial a = 1 - b ---
  const iid = Math.abs(a - (1 - b)) < 1e-12 && s > 0;

  return {
    P,
    a,
    b,
    s,
    scenario,
    classes,
    closed,
    stateInfo,
    periods,
    stationary,
    uniqueStationary,
    limitMatrix,
    meanRecurrence,
    firstPassage,
    absorption,
    reach01,
    reach10,
    iid,
  };
}

// periodo del estado st según la matriz P (2x2)
function period(P, st) {
  // recogemos los n (1..40) con (P^n)_{st,st} > 0 y calculamos su mcd
  let M = [
    [1, 0],
    [0, 1],
  ];
  const gcd = (x, y) => (y === 0 ? x : gcd(y, x % y));
  let d = 0;
  const mul = (A, B) => [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ];
  for (let n = 1; n <= 60; n++) {
    M = mul(M, P);
    if (M[st][st] > 1e-12) d = d === 0 ? n : gcd(d, n);
    if (d === 1) break;
  }
  return d === 0 ? Infinity : d; // ∞ si nunca regresa (no ocurre en finitas recurrentes)
}

// ============================================================================
//  CONTROLES
// ============================================================================
function Param({ label, desc, value, onChange, color }) {
  return (
    <div className="mk-param">
      <div className="mk-param-top">
        <span className="mk-param-label" style={{ color }}>
          {label}
        </span>
        <input
          className="mk-param-num"
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      </div>
      <input
        className="mk-slider"
        style={{ accentColor: color }}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="mk-param-desc">{desc}</div>
    </div>
  );
}

// Diagrama de transición animado (SVG)
function Diagram({ a, b }) {
  return (
    <div className="mk-diagram">
      <svg viewBox="0 0 320 170" width="100%" height="170">
        {/* self loop 0  (1-a) */}
        <path
          d="M 70 95 C 30 130, 30 60, 60 75"
          className="dg-edge"
          markerEnd="url(#arr)"
          fill="none"
        />
        <text x="22" y="100" className="dg-lbl">
          1−a = {fmt(1 - a, 2)}
        </text>

        {/* self loop 1 (1-b) */}
        <path
          d="M 250 75 C 290 60, 290 130, 260 95"
          className="dg-edge"
          markerEnd="url(#arr)"
          fill="none"
        />
        <text x="270" y="100" className="dg-lbl">
          1−b = {fmt(1 - b, 2)}
        </text>

        {/* 0 -> 1 (a) arriba */}
        <path
          d="M 110 55 C 140 30, 180 30, 210 55"
          className="dg-edge dg-a"
          markerEnd="url(#arrA)"
          fill="none"
        />
        <text x="150" y="28" className="dg-lbl dg-lbl-a">
          a = {fmt(a, 2)}
        </text>

        {/* 1 -> 0 (b) abajo */}
        <path
          d="M 210 115 C 180 140, 140 140, 110 115"
          className="dg-edge dg-b"
          markerEnd="url(#arrB)"
          fill="none"
        />
        <text x="150" y="158" className="dg-lbl dg-lbl-b">
          b = {fmt(b, 2)}
        </text>

        {/* nodos */}
        <circle cx="90" cy="85" r="26" className="dg-node" />
        <text x="90" y="92" className="dg-node-lbl">
          0
        </text>
        <circle cx="230" cy="85" r="26" className="dg-node" />
        <text x="230" y="92" className="dg-node-lbl">
          1
        </text>

        <defs>
          <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-soft)" />
          </marker>
          <marker id="arrA" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--c-a)" />
          </marker>
          <marker id="arrB" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--c-b)" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

// ============================================================================
//  PANEL: MATRIZ
// ============================================================================
function MatrizPanel({ a, b, A }) {
  const [n, setN] = useState(5);
  const PnM = Pn(a, b, n);
  return (
    <Card title="1 · Matriz de transición y potencias">
      <p className="mk-text">
        La matriz de transición en un paso reúne las probabilidades{" "}
        <span className="mono">P(i,j) = P(Xₙ₊₁ = j | Xₙ = i)</span>:
      </p>
      <Matrix M={A.P} rowLabels={["0", "1"]} colLabels={["0", "1"]} caption="P" big />

      <p className="mk-text">
        Las probabilidades de transición en <strong>n pasos</strong> se obtienen con
        la fórmula cerrada del proyecto (válida para a + b &gt; 0):
      </p>
      <div className="mk-formula">
        P(n) = 1/(a+b) · [[b, a],[b, a]] + (1−a−b)ⁿ/(a+b) · [[a, −a],[−b, b]]
      </div>

      <div className="mk-nslider">
        <label>
          n = <strong>{n}</strong>
        </label>
        <input
          type="range"
          min={1}
          max={40}
          value={n}
          onChange={(e) => setN(parseInt(e.target.value))}
        />
      </div>
      <Matrix
        M={PnM}
        rowLabels={["0", "1"]}
        colLabels={["0", "1"]}
        caption={`P(${n})`}
        big
      />

      {A.s > 0 && A.s !== 2 && (
        <p className="mk-note">
          Conforme n crece, P(n) tiende a la matriz límite con filas iguales a la
          distribución estacionaria π = ({fmt(A.stationary[0])}, {fmt(A.stationary[1])}),
          porque |1−a−b| &lt; 1.
        </p>
      )}
      {A.s === 2 && (
        <p className="mk-note warn">
          Con a = b = 1 se tiene (1−a−b)ⁿ = (−1)ⁿ, que oscila: la cadena es
          periódica y P(n) no converge.
        </p>
      )}
    </Card>
  );
}

// ============================================================================
//  PANEL: CLASES Y ESTADOS
// ============================================================================
function ClasesPanel({ A }) {
  const scenLabel = {
    irreducible: "Cadena irreducible (a > 0 y b > 0)",
    abs0: "Estado 0 absorbente (a = 0)",
    abs1: "Estado 1 absorbente (b = 0)",
    identidad: "Dos estados absorbentes (a = b = 0, P = I)",
  };
  return (
    <Card title="2 · Clases de comunicación · 3 · Clasificación de estados">
      <div className="mk-pill">{scenLabel[A.scenario]}</div>

      <h4 className="mk-h4">Clases de comunicación</h4>
      <p className="mk-text">
        Dos estados i, j se comunican si i puede alcanzar a j y j puede alcanzar a
        i. Esto particiona el espacio de estados en clases.
      </p>
      <div className="mk-classes">
        {A.classes.map((cls, i) => (
          <div key={i} className={"mk-class " + (A.closed[i] ? "rec" : "tra")}>
            <div className="mk-class-set">{`{ ${cls.join(", ")} }`}</div>
            <div className="mk-class-tag">
              {A.closed[i] ? "cerrada · recurrente" : "abierta · transitoria"}
            </div>
          </div>
        ))}
      </div>

      <h4 className="mk-h4">Clasificación de los estados</h4>
      <table className="mk-table">
        <thead>
          <tr>
            <th>Estado</th>
            <th>Clase</th>
            <th>Tipo</th>
            <th>Recurrencia</th>
          </tr>
        </thead>
        <tbody>
          {A.stateInfo.map((s) => (
            <tr key={s.state}>
              <td className="mono">{s.state}</td>
              <td className="mono">{`{ ${A.classes[s.classIndex].join(", ")} }`}</td>
              <td>
                <span className={"badge " + (s.kind.includes("recurrente") ? "g" : "r")}>
                  {s.kind}
                </span>
              </td>
              <td>
                {s.kind === "transitorio"
                  ? "se visita un nº finito de veces"
                  : "se visita infinitas veces (m_ii < ∞)"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mk-note">
        En una cadena con espacio de estados <strong>finito</strong> no existen
        estados recurrentes nulos: toda clase recurrente es recurrente positiva.
        Por eso aquí solo aparecen estados <em>transitorios</em> o{" "}
        <em>recurrentes positivos</em>.
      </p>
    </Card>
  );
}

// ============================================================================
//  PANEL: PERIODOS
// ============================================================================
function PeriodosPanel({ A }) {
  return (
    <Card title="4 · Periodos de los estados">
      <p className="mk-text">
        El periodo de un estado i es{" "}
        <span className="mono">d(i) = mcd {"{ n ≥ 1 : Pⁿ(i,i) > 0 }"}</span>. Si
        d(i) = 1 el estado es <strong>aperiódico</strong>.
      </p>
      <div className="mk-period-grid">
        {A.periods.map((p, i) => (
          <div key={i} className="mk-period">
            <div className="mk-period-state">estado {i}</div>
            <div className="mk-period-val">d({i}) = {p === Infinity ? "∞" : p}</div>
            <div className="mk-period-tag">
              {p === 1 ? "aperiódico" : p === Infinity ? "nunca retorna" : `periodo ${p}`}
            </div>
          </div>
        ))}
      </div>

      {A.s === 2 ? (
        <p className="mk-note warn">
          Con a = b = 1, P = [[0,1],[1,0]]: la cadena solo regresa a cada estado en
          un número par de pasos, de modo que el periodo es <strong>2</strong>. La
          cadena alterna 0, 1, 0, 1, … de forma determinista.
        </p>
      ) : (
        <p className="mk-note">
          Mientras 1−a−b ≠ −1, cada estado tiene un lazo propio con probabilidad
          positiva (1−a o 1−b), por lo que Pⁿ(i,i) &gt; 0 para todo n y el periodo
          es 1: la cadena es <strong>aperiódica</strong>.
        </p>
      )}
    </Card>
  );
}

// ============================================================================
//  PANEL: DISTRIBUCIONES
// ============================================================================
function DistPanel({ a, b, A }) {
  const [p0, setP0] = useState(1);
  const [steps, setSteps] = useState(20);

  const traj = useMemo(() => {
    const out = [];
    let v = [p0, 1 - p0];
    out.push([...v]);
    for (let n = 1; n <= steps; n++) {
      v = rowTimesMatrix(v, A.P);
      out.push([...v]);
    }
    return out;
  }, [p0, steps, A.P]);

  return (
    <Card title="5 · Distribución de Xₙ y distribución estacionaria">
      <p className="mk-text">
        Si μ₀ = (p₀, p₁) es la distribución inicial, entonces la distribución de Xₙ
        es <span className="mono">μₙ = μ₀ · Pⁿ</span>.
      </p>

      <div className="mk-init">
        <label>
          p₀ = P(X₀ = 0) = <strong>{fmt(p0, 2)}</strong>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={p0}
          onChange={(e) => setP0(parseFloat(e.target.value))}
        />
        <label>
          pasos: <strong>{steps}</strong>
        </label>
        <input
          type="range"
          min={5}
          max={60}
          value={steps}
          onChange={(e) => setSteps(parseInt(e.target.value))}
        />
      </div>

      <DistChart traj={traj} stationary={A.stationary} s={A.s} />

      <h4 className="mk-h4">Distribución estacionaria π</h4>
      {A.stationary ? (
        <>
          <div className="mk-stat-row">
            <div className="mk-stat-box">
              <span>π₀ = b/(a+b)</span>
              <strong>{fmt(A.stationary[0])}</strong>
            </div>
            <div className="mk-stat-box">
              <span>π₁ = a/(a+b)</span>
              <strong>{fmt(A.stationary[1])}</strong>
            </div>
          </div>
          <p className="mk-note">
            π satisface π = πP. {A.s !== 2 && A.scenario === "irreducible"
              ? "Como la cadena es irreducible y aperiódica, μₙ → π para cualquier inicio."
              : A.s === 2
              ? "Aquí la cadena es periódica: π es estacionaria pero μₙ no converge a ella si el inicio no es π."
              : "Es la única distribución estacionaria, concentrada en el estado absorbente."}
          </p>
        </>
      ) : (
        <p className="mk-note warn">
          Con a = b = 0 la matriz es la identidad: <strong>toda</strong> distribución
          es estacionaria, no hay una única.
        </p>
      )}
    </Card>
  );
}

function DistChart({ traj, stationary, s }) {
  const W = 560,
    H = 230,
    padL = 38,
    padB = 26,
    padT = 14,
    padR = 14;
  const n = traj.length - 1;
  const x = (i) => padL + (i / n) * (W - padL - padR);
  const y = (p) => padT + (1 - p) * (H - padT - padB);
  const path = (idx) =>
    traj.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v[idx])}`).join(" ");

  return (
    <div className="mk-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {/* ejes */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} className="ch-grid" />
            <text x={padL - 6} y={y(g) + 3} className="ch-axis" textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        <text x={(W) / 2} y={H - 4} className="ch-axis" textAnchor="middle">
          n (pasos)
        </text>

        {/* línea estacionaria */}
        {stationary && s !== 2 && (
          <>
            <line
              x1={padL}
              y1={y(stationary[0])}
              x2={W - padR}
              y2={y(stationary[0])}
              className="ch-stat"
            />
            <line
              x1={padL}
              y1={y(stationary[1])}
              x2={W - padR}
              y2={y(stationary[1])}
              className="ch-stat"
            />
          </>
        )}

        <path d={path(0)} className="ch-line ch-0" fill="none" />
        <path d={path(1)} className="ch-line ch-1" fill="none" />
        {traj.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v[0])} r="2.4" className="ch-dot ch-0d" />
            <circle cx={x(i)} cy={y(v[1])} r="2.4" className="ch-dot ch-1d" />
          </g>
        ))}
      </svg>
      <div className="mk-legend">
        <span className="lg lg0">P(Xₙ = 0)</span>
        <span className="lg lg1">P(Xₙ = 1)</span>
        {stationary && s !== 2 && <span className="lg lgs">π (estacionaria)</span>}
      </div>
    </div>
  );
}

// ============================================================================
//  PANEL: TIEMPOS MEDIOS
// ============================================================================
function TiemposPanel({ A }) {
  return (
    <Card title="5 · Tiempos medios de transición, recurrencia y absorción">
      {A.firstPassage ? (
        <>
          <h4 className="mk-h4">Tiempos medios de primer paso (transición)</h4>
          <p className="mk-text">
            m(i→j) es el número esperado de pasos para alcanzar j por primera vez
            partiendo de i. Resolviendo m(0→1) = 1 + (1−a)·m(0→1) se obtiene:
          </p>
          <div className="mk-time-grid">
            <TimeBox label="m(0 → 1)" formula="1 / a" value={A.firstPassage["0->1"]} />
            <TimeBox label="m(1 → 0)" formula="1 / b" value={A.firstPassage["1->0"]} />
          </div>

          <h4 className="mk-h4">Tiempos medios de recurrencia</h4>
          <p className="mk-text">
            m(i→i) es el tiempo esperado de retorno al estado i. Para una cadena
            irreducible recurrente positiva vale 1/πᵢ:
          </p>
          <div className="mk-time-grid">
            <TimeBox
              label="m(0 → 0)"
              formula="1/π₀ = (a+b)/b"
              value={A.firstPassage["0->0"]}
            />
            <TimeBox
              label="m(1 → 1)"
              formula="1/π₁ = (a+b)/a"
              value={A.firstPassage["1->1"]}
            />
          </div>
        </>
      ) : (
        <p className="mk-text">
          La cadena no es irreducible, así que algunos tiempos de transición son
          infinitos. Se analiza la absorción más abajo.
        </p>
      )}

      {A.absorption && (
        <>
          <h4 className="mk-h4">Análisis de absorción</h4>
          <p className="mk-note">{A.absorption.note}</p>
          {Object.keys(A.absorption.meanAbsorption).length > 0 && (
            <div className="mk-time-grid">
              {Object.entries(A.absorption.meanAbsorption).map(([st, v]) => (
                <TimeBox
                  key={st}
                  label={`Absorción desde ${st}`}
                  formula={A.scenario === "abs0" ? "1 / b" : "1 / a"}
                  value={v}
                />
              ))}
            </div>
          )}
        </>
      )}

      {A.iid && (
        <p className="mk-note ok">
          Caso especial a = 1 − b: las variables X₁, X₂, … son independientes e
          idénticamente distribuidas, con P(Xₙ = 1) = a y P(Xₙ = 0) = 1 − a. La
          cadena "olvida" su estado anterior.
        </p>
      )}
    </Card>
  );
}

function TimeBox({ label, formula, value }) {
  return (
    <div className="mk-time">
      <div className="mk-time-label">{label}</div>
      <div className="mk-time-formula mono">{formula}</div>
      <div className="mk-time-value">{fmt(value)}</div>
      <div className="mk-time-unit">pasos</div>
    </div>
  );
}

// ============================================================================
//  PANEL: SIMULACIÓN
// ============================================================================
function SimPanel({ a, b, A }) {
  const [start, setStart] = useState(0);
  const [steps, setSteps] = useState(200);
  const [run, setRun] = useState(0); // trigger
  const [path, setPath] = useState([]);
  const [live, setLive] = useState(false);
  const timer = useRef(null);

  const simulate = (N, s0) => {
    const out = [s0];
    let cur = s0;
    for (let i = 0; i < N; i++) {
      const r = Math.random();
      if (cur === 0) cur = r < a ? 1 : 0;
      else cur = r < b ? 0 : 1;
      out.push(cur);
    }
    return out;
  };

  const doRun = () => {
    stopLive();
    setPath(simulate(steps, start));
    setRun((r) => r + 1);
  };

  const startLive = () => {
    if (live) return;
    setLive(true);
    setPath([start]);
    let cur = start;
    timer.current = setInterval(() => {
      setPath((prev) => {
        if (prev.length > 400) {
          stopLive();
          return prev;
        }
        const last = prev[prev.length - 1];
        const r = Math.random();
        let nx;
        if (last === 0) nx = r < a ? 1 : 0;
        else nx = r < b ? 0 : 1;
        cur = nx;
        return [...prev, nx];
      });
    }, 120);
  };
  const stopLive = () => {
    setLive(false);
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => stopLive(), []);

  // estadísticas empíricas
  const stats = useMemo(() => {
    if (!path.length) return null;
    const c0 = path.filter((x) => x === 0).length;
    const c1 = path.length - c0;
    // transiciones
    let t01 = 0,
      t10 = 0,
      n0 = 0,
      n1 = 0;
    for (let i = 0; i < path.length - 1; i++) {
      if (path[i] === 0) {
        n0++;
        if (path[i + 1] === 1) t01++;
      } else {
        n1++;
        if (path[i + 1] === 0) t10++;
      }
    }
    return {
      f0: c0 / path.length,
      f1: c1 / path.length,
      ahat: n0 ? t01 / n0 : 0,
      bhat: n1 ? t10 / n1 : 0,
      len: path.length,
    };
  }, [path, run]);

  return (
    <Card title="Simulación de la cadena (Monte Carlo)">
      <p className="mk-text">
        Se genera una trayectoria X₀, X₁, … usando las probabilidades a y b. Compara
        las frecuencias empíricas con la distribución estacionaria teórica.
      </p>

      <div className="mk-sim-controls">
        <div className="mk-sim-field">
          <label>Estado inicial X₀</label>
          <div className="mk-toggle">
            <button className={start === 0 ? "on" : ""} onClick={() => setStart(0)}>
              0
            </button>
            <button className={start === 1 ? "on" : ""} onClick={() => setStart(1)}>
              1
            </button>
          </div>
        </div>
        <div className="mk-sim-field grow">
          <label>
            Pasos: <strong>{steps}</strong>
          </label>
          <input
            type="range"
            min={20}
            max={1000}
            step={10}
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))}
          />
        </div>
        <div className="mk-sim-btns">
          <button className="mk-btn primary" onClick={doRun}>
            Simular
          </button>
          {!live ? (
            <button className="mk-btn" onClick={startLive}>
              ▶ En vivo
            </button>
          ) : (
            <button className="mk-btn stop" onClick={stopLive}>
              ■ Parar
            </button>
          )}
        </div>
      </div>

      {path.length > 0 && (
        <>
          <SimTrace path={path} />
          {stats && (
            <div className="mk-sim-stats">
              <StatCompare
                title="Frecuencia de visita al estado 0"
                emp={stats.f0}
                theo={A.stationary ? A.stationary[0] : null}
              />
              <StatCompare
                title="Frecuencia de visita al estado 1"
                emp={stats.f1}
                theo={A.stationary ? A.stationary[1] : null}
              />
              <StatCompare title="â estimado (0→1)" emp={stats.ahat} theo={a} />
              <StatCompare title="b̂ estimado (1→0)" emp={stats.bhat} theo={b} />
            </div>
          )}
          <p className="mk-note">
            Trayectoria de {stats?.len} estados. A medida que crece la longitud, las
            frecuencias empíricas se aproximan a la distribución estacionaria
            (ley fuerte de los grandes números para cadenas ergódicas).
          </p>
        </>
      )}
    </Card>
  );
}

function SimTrace({ path }) {
  const W = 560,
    H = 90,
    padL = 28,
    padR = 10,
    padT = 14,
    padB = 22;
  const n = path.length - 1;
  const x = (i) => padL + (i / Math.max(1, n)) * (W - padL - padR);
  const y = (st) => (st === 0 ? padT + 8 : H - padB - 8);
  // construir línea escalonada
  let d = "";
  path.forEach((st, i) => {
    const px = x(i),
      py = y(st);
    if (i === 0) d += `M ${px} ${py}`;
    else {
      const prevY = y(path[i - 1]);
      d += ` L ${px} ${prevY} L ${px} ${py}`;
    }
  });
  return (
    <div className="mk-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} className="ch-grid" />
        <line x1={padL} y1={y(1)} x2={W - padR} y2={y(1)} className="ch-grid" />
        <text x={padL - 8} y={y(0) + 3} className="ch-axis" textAnchor="end">
          0
        </text>
        <text x={padL - 8} y={y(1) + 3} className="ch-axis" textAnchor="end">
          1
        </text>
        <path d={d} className="ch-trace" fill="none" />
      </svg>
    </div>
  );
}

function StatCompare({ title, emp, theo }) {
  const W = 100;
  return (
    <div className="mk-sc">
      <div className="mk-sc-title">{title}</div>
      <div className="mk-sc-bars">
        <div className="mk-sc-bar">
          <div className="mk-sc-fill emp" style={{ width: `${emp * W}%` }} />
          <span>emp {fmt(emp, 3)}</span>
        </div>
        {theo != null && (
          <div className="mk-sc-bar">
            <div className="mk-sc-fill theo" style={{ width: `${theo * W}%` }} />
            <span>teo {fmt(theo, 3)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
//  COMPONENTES BÁSICOS
// ============================================================================
function Card({ title, children }) {
  return (
    <section className="mk-card">
      <h3 className="mk-card-title">{title}</h3>
      {children}
    </section>
  );
}

function Matrix({ M, rowLabels, colLabels, caption, big }) {
  return (
    <div className={"mk-matrix" + (big ? " big" : "")}>
      <span className="mk-matrix-cap">{caption} =</span>
      <table>
        <thead>
          <tr>
            <th></th>
            {colLabels.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {M.map((row, i) => (
            <tr key={i}>
              <th>{rowLabels[i]}</th>
              {row.map((v, j) => (
                <td key={j}>{fmt(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
//  ESTILOS
// ============================================================================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Spline+Sans:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500&display=swap');

.mk-root{
  --bg:#f4f1ea; --panel:#fffdf8; --ink:#23201b; --ink-soft:#6b6457;
  --line:#e3ddd0; --c-a:#c0553b; --c-b:#2f6d6a; --gold:#b8893a;
  --rec:#2f6d6a; --tra:#c0553b;
  font-family:'Spline Sans',sans-serif; color:var(--ink);
  background:
    radial-gradient(ellipse at top, #faf7f0, var(--bg));
  min-height:100vh; padding:26px 16px 60px; line-height:1.5;
}
.mono,.mk-root .mono{font-family:'Spline Sans Mono',monospace;}
.mk-head{max-width:760px;margin:0 auto 22px;text-align:center;}
.mk-head-tag{font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--gold);margin-bottom:8px;}
.mk-head h1{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(26px,5vw,40px);
  margin:0;letter-spacing:-.01em;}
.mk-sub{color:var(--ink-soft);margin:8px 0 0;font-size:14px;}

.mk-params{max-width:760px;margin:0 auto 14px;display:grid;
  grid-template-columns:1fr 1fr;gap:14px;}
.mk-param{background:var(--panel);border:1px solid var(--line);border-radius:14px;
  padding:14px 16px;}
.mk-param-top{display:flex;justify-content:space-between;align-items:center;}
.mk-param-label{font-family:'Fraunces',serif;font-size:24px;font-weight:600;}
.mk-param-num{width:74px;border:1px solid var(--line);border-radius:8px;padding:5px 8px;
  font-family:'Spline Sans Mono',monospace;font-size:14px;text-align:right;background:#fff;color:var(--ink);}
.mk-slider{width:100%;margin:10px 0 6px;}
.mk-param-desc{font-size:12px;color:var(--ink-soft);}
.mk-diagram{grid-column:1/-1;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;padding:6px 10px;}

.dg-node{fill:#fff;stroke:var(--ink);stroke-width:1.8;}
.dg-node-lbl{font-family:'Fraunces',serif;font-size:20px;font-weight:600;text-anchor:middle;fill:var(--ink);}
.dg-edge{stroke:var(--ink-soft);stroke-width:1.6;}
.dg-a{stroke:var(--c-a);} .dg-b{stroke:var(--c-b);}
.dg-lbl{font-family:'Spline Sans Mono',monospace;font-size:10px;fill:var(--ink-soft);text-anchor:middle;}
.dg-lbl-a{fill:var(--c-a);} .dg-lbl-b{fill:var(--c-b);}

.mk-tabs{max-width:760px;margin:0 auto 16px;display:flex;flex-wrap:wrap;gap:6px;
  border-bottom:1px solid var(--line);padding-bottom:0;}
.mk-tab{border:none;background:none;padding:9px 13px;font-family:'Spline Sans',sans-serif;
  font-size:13.5px;font-weight:500;color:var(--ink-soft);cursor:pointer;border-radius:9px 9px 0 0;
  border-bottom:2px solid transparent;margin-bottom:-1px;transition:.15s;}
.mk-tab:hover{color:var(--ink);background:rgba(0,0,0,.03);}
.mk-tab.active{color:var(--ink);border-bottom-color:var(--gold);font-weight:600;}

.mk-main{max-width:760px;margin:0 auto;}
.mk-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;
  padding:22px 22px 24px;box-shadow:0 1px 0 rgba(0,0,0,.02);}
.mk-card-title{font-family:'Fraunces',serif;font-weight:600;font-size:19px;margin:0 0 14px;
  padding-bottom:10px;border-bottom:1px solid var(--line);}
.mk-text{font-size:14.5px;margin:0 0 14px;}
.mk-h4{font-family:'Fraunces',serif;font-weight:600;font-size:16px;margin:24px 0 10px;}

.mk-formula{font-family:'Spline Sans Mono',monospace;font-size:12.5px;background:#f7f3ea;
  border:1px dashed var(--line);border-radius:10px;padding:12px 14px;margin:0 0 16px;
  overflow-x:auto;color:var(--ink);}

.mk-matrix{display:flex;align-items:center;gap:10px;margin:6px 0 16px;flex-wrap:wrap;}
.mk-matrix-cap{font-family:'Fraunces',serif;font-size:20px;font-weight:600;}
.mk-matrix table{border-collapse:collapse;font-family:'Spline Sans Mono',monospace;}
.mk-matrix.big td{font-size:15px;padding:9px 16px;}
.mk-matrix th{color:var(--ink-soft);font-weight:500;font-size:12px;padding:5px 14px;}
.mk-matrix td{border:1px solid var(--line);padding:7px 14px;text-align:center;background:#fff;}
.mk-matrix tbody th{border:none;}

.mk-nslider{display:flex;align-items:center;gap:14px;margin:8px 0 12px;font-size:14px;}
.mk-nslider input{flex:1;}
.mk-note{font-size:13px;color:var(--ink-soft);background:#f7f3ea;border-left:3px solid var(--gold);
  border-radius:0 8px 8px 0;padding:10px 13px;margin:12px 0 0;}
.mk-note.warn{border-left-color:var(--c-a);background:#fbf0ec;}
.mk-note.ok{border-left-color:var(--rec);background:#eef5f4;}

.mk-pill{display:inline-block;font-size:13px;font-weight:600;background:var(--ink);color:#fff;
  padding:5px 13px;border-radius:999px;margin-bottom:6px;}
.mk-classes{display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 8px;}
.mk-class{flex:1;min-width:140px;border:1.5px solid;border-radius:12px;padding:13px 14px;text-align:center;}
.mk-class.rec{border-color:var(--rec);background:#eef5f4;}
.mk-class.tra{border-color:var(--tra);background:#fbf0ec;}
.mk-class-set{font-family:'Spline Sans Mono',monospace;font-size:20px;font-weight:500;}
.mk-class-tag{font-size:11.5px;color:var(--ink-soft);margin-top:4px;text-transform:uppercase;letter-spacing:.06em;}

.mk-table{width:100%;border-collapse:collapse;font-size:13.5px;margin:4px 0;}
.mk-table th{text-align:left;color:var(--ink-soft);font-weight:500;font-size:12px;
  padding:8px 10px;border-bottom:1px solid var(--line);}
.mk-table td{padding:9px 10px;border-bottom:1px solid var(--line);}
.badge{font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;}
.badge.g{background:#e3efed;color:var(--rec);}
.badge.r{background:#f6e2db;color:var(--tra);}

.mk-period-grid{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0;}
.mk-period{flex:1;min-width:140px;background:#f7f3ea;border:1px solid var(--line);border-radius:12px;
  padding:16px;text-align:center;}
.mk-period-state{font-size:12px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.08em;}
.mk-period-val{font-family:'Fraunces',serif;font-size:26px;font-weight:600;margin:6px 0;}
.mk-period-tag{font-size:12px;color:var(--gold);font-weight:600;}

.mk-init,.mk-sim-field{display:flex;flex-direction:column;gap:4px;font-size:13px;margin:4px 0;}
.mk-init label{margin-top:8px;}
.mk-init input{width:100%;}

.mk-chart{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px;margin:6px 0 4px;}
.ch-grid{stroke:#eee5d6;stroke-width:1;}
.ch-axis{font-family:'Spline Sans Mono',monospace;font-size:9px;fill:var(--ink-soft);}
.ch-stat{stroke:var(--gold);stroke-width:1;stroke-dasharray:4 3;opacity:.7;}
.ch-line{stroke-width:2;}
.ch-0{stroke:var(--c-a);} .ch-1{stroke:var(--c-b);}
.ch-dot{}.ch-0d{fill:var(--c-a);} .ch-1d{fill:var(--c-b);}
.ch-trace{stroke:var(--ink);stroke-width:1.6;}
.mk-legend{display:flex;gap:16px;justify-content:center;font-size:12px;margin-top:4px;flex-wrap:wrap;}
.lg{position:relative;padding-left:18px;color:var(--ink-soft);}
.lg::before{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);
  width:12px;height:3px;border-radius:2px;}
.lg0::before{background:var(--c-a);} .lg1::before{background:var(--c-b);}
.lgs::before{background:var(--gold);}

.mk-stat-row{display:flex;gap:12px;margin:4px 0;}
.mk-stat-box{flex:1;background:#f7f3ea;border:1px solid var(--line);border-radius:12px;
  padding:14px;text-align:center;}
.mk-stat-box span{display:block;font-family:'Spline Sans Mono',monospace;font-size:12px;color:var(--ink-soft);}
.mk-stat-box strong{font-family:'Fraunces',serif;font-size:24px;}

.mk-time-grid{display:flex;gap:12px;flex-wrap:wrap;margin:4px 0 8px;}
.mk-time{flex:1;min-width:130px;background:#f7f3ea;border:1px solid var(--line);
  border-radius:12px;padding:14px;text-align:center;}
.mk-time-label{font-size:13px;font-weight:600;}
.mk-time-formula{font-size:11.5px;color:var(--ink-soft);margin:3px 0;}
.mk-time-value{font-family:'Fraunces',serif;font-size:26px;font-weight:600;}
.mk-time-unit{font-size:11px;color:var(--ink-soft);}

.mk-sim-controls{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;
  background:#f7f3ea;border:1px solid var(--line);border-radius:12px;padding:14px;}
.mk-sim-field.grow{flex:1;min-width:180px;}
.mk-toggle{display:flex;gap:4px;}
.mk-toggle button{width:42px;height:36px;border:1px solid var(--line);background:#fff;
  border-radius:8px;font-family:'Spline Sans Mono',monospace;font-size:15px;cursor:pointer;color:var(--ink);}
.mk-toggle button.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.mk-sim-btns{display:flex;gap:8px;}
.mk-btn{border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 16px;
  font-family:'Spline Sans',sans-serif;font-weight:600;font-size:13.5px;cursor:pointer;color:var(--ink);transition:.15s;}
.mk-btn:hover{background:#f0ebe0;}
.mk-btn.primary{background:var(--gold);color:#fff;border-color:var(--gold);}
.mk-btn.primary:hover{filter:brightness(1.06);}
.mk-btn.stop{background:var(--c-a);color:#fff;border-color:var(--c-a);}

.mk-sim-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0 4px;}
.mk-sc{background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;}
.mk-sc-title{font-size:12px;color:var(--ink-soft);margin-bottom:7px;}
.mk-sc-bars{display:flex;flex-direction:column;gap:5px;}
.mk-sc-bar{position:relative;height:18px;background:#f1ece1;border-radius:5px;overflow:hidden;}
.mk-sc-fill{height:100%;border-radius:5px;}
.mk-sc-fill.emp{background:var(--ink);}
.mk-sc-fill.theo{background:var(--gold);}
.mk-sc-bar span{position:absolute;right:7px;top:50%;transform:translateY(-50%);
  font-family:'Spline Sans Mono',monospace;font-size:10.5px;color:var(--ink);mix-blend-mode:difference;color:#fff;}

.mk-foot{max-width:760px;margin:26px auto 0;text-align:center;font-size:12px;color:var(--ink-soft);}

@media(max-width:620px){
  .mk-params{grid-template-columns:1fr;}
  .mk-sim-stats{grid-template-columns:1fr;}
}
`;
