import { BarChart3, TrendingUp, LineChart, ArrowRight } from 'lucide-react';
import type { TabId } from '../components/layout/Sidebar';

interface ModuleCard {
  id: TabId;
  icon: React.ElementType;
  color: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
}

const MODULES: ModuleCard[] = [
  {
    id: 'abc',
    icon: BarChart3,
    color: 'border-blue-100 hover:border-blue-300',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    title: 'Analisi ABC',
    subtitle: 'Classificazione referenze per valore',
    description:
      'Segmenta il portafoglio prodotti con la metodologia ABC basata su fatturato e marginalità. Identifica i prodotti di maggior impatto economico e ottimizza le priorità commerciali.',
    tags: ['Pareto', 'Rating Combinato', 'Export CSV'],
  },
  {
    id: 'variance',
    icon: TrendingUp,
    color: 'border-emerald-100 hover:border-emerald-300',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'Varianza Marginalità',
    subtitle: 'Waterfall analysis Δ Margine',
    description:
      'Scompone la variazione di margine tra due periodi in quattro effetti: Volume, Mix, Prezzo e Costo. Identifica le leve che hanno generato o eroso la marginalità.',
    tags: ['Effetto Volume', 'Effetto Mix', 'Effetto Prezzo/Costo'],
  },
  {
    id: 'balance',
    icon: LineChart,
    color: 'border-violet-100 hover:border-violet-300',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: 'Analisi Bilancio',
    subtitle: 'KPI e indici di bilancio',
    description:
      'Calcola EBITDA, EBIT, utile netto, ROE, ROA, Current Ratio e Net Debt/EBITDA a partire dai dati di Conto Economico e Stato Patrimoniale. Confronto multi-anno integrato.',
    tags: ['CE & SP', 'Indici Liquidità', 'Leva Finanziaria'],
  },
];

interface DashboardProps {
  onNavigate: (tab: TabId) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 text-white relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-blue-600/10 pointer-events-none" />
        <div className="absolute -bottom-8 -right-4 w-32 h-32 rounded-full bg-blue-500/10 pointer-events-none" />

        <div className="relative z-10">
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            Benvenuto in MarginView
          </h2>
          <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
            Suite professionale di controllo di gestione. Analizza il portafoglio prodotti,
            scomponi le variazioni di margine e monitora gli indici di bilancio in un'unica
            piattaforma integrata.
          </p>
        </div>
      </div>

      {/* Module cards */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
          Moduli disponibili
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {MODULES.map(({ id, icon: Icon, color, iconBg, iconColor, title, subtitle, description, tags }) => (
            <div
              key={id}
              className={`
                bg-white rounded-2xl border-2 ${color}
                p-6 flex flex-col gap-4 transition-all duration-200
                hover:shadow-lg cursor-pointer group
              `}
              onClick={() => onNavigate(id)}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed flex-1">{description}</p>

              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <button
                onClick={e => { e.stopPropagation(); onNavigate(id); }}
                className={`
                  w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                  text-sm font-semibold transition-all duration-150
                  bg-slate-900 text-white hover:bg-slate-700
                  group-hover:shadow-md
                `}
              >
                Accedi al modulo
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
