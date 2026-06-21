import { BarChart3, TrendingUp, LineChart, ArrowRight } from 'lucide-react';
import type { TabId } from '../components/layout/Sidebar';

interface ModuleCard {
  id: TabId;
  icon: React.ElementType;
  accent: string;
  title: string;
  subtitle: string;
  description: string;
}

const MODULES: ModuleCard[] = [
  {
    id: 'abc',
    icon: BarChart3,
    accent: 'bg-blue-500',
    title: 'Analisi ABC',
    subtitle: 'Classificazione referenze per valore',
    description:
      'Segmenta il portafoglio prodotti con la metodologia ABC basata su fatturato e marginalità. Identifica i prodotti di maggior impatto e ottimizza le priorità commerciali.',
  },
  {
    id: 'variance',
    icon: TrendingUp,
    accent: 'bg-emerald-500',
    title: 'Varianza Marginalità',
    subtitle: 'Waterfall analysis Δ Margine',
    description:
      'Scompone la variazione di margine tra due periodi in quattro effetti: Volume, Mix, Prezzo e Costo. Individua le leve che hanno generato o eroso la marginalità.',
  },
  {
    id: 'balance',
    icon: LineChart,
    accent: 'bg-violet-500',
    title: 'Analisi Bilancio',
    subtitle: 'KPI e indici di bilancio',
    description:
      'Calcola EBITDA, EBIT, ROE, ROA, Current Ratio e Net Debt/EBITDA da Conto Economico e Stato Patrimoniale. Confronto multi-anno integrato.',
  },
];

interface DashboardProps {
  onNavigate: (tab: TabId) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="px-8 pt-8 pb-16 max-w-5xl">

      {/* Page header */}
      <div className="mb-10">
        <h1 className="text-[28px] font-bold text-gray-900 tracking-tight leading-tight">
          MarginView
        </h1>
        <p className="text-[15px] text-gray-400 mt-1.5 font-normal">
          Suite professionale di controllo di gestione
        </p>
      </div>

      {/* 3 module cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MODULES.map(({ id, icon: Icon, accent, title, subtitle, description }) => (
          <div
            key={id}
            onClick={() => onNavigate(id)}
            className="
              bg-white rounded-2xl p-6 cursor-pointer group
              border border-black/[0.06]
              shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]
              hover:shadow-[0_8px_24px_rgba(0,0,0,0.10),0_2px_6px_rgba(0,0,0,0.06)]
              hover:-translate-y-0.5
              transition-all duration-200 ease-out
            "
          >
            {/* Icon */}
            <div className={`
              w-12 h-12 rounded-2xl ${accent}
              flex items-center justify-center mb-5 flex-shrink-0
              group-hover:scale-[1.06] transition-transform duration-200
            `}>
              <Icon className="w-6 h-6 text-white" strokeWidth={1.75} />
            </div>

            {/* Text */}
            <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight mb-1">
              {title}
            </h3>
            <p className="text-[12px] text-gray-400 font-medium mb-3">{subtitle}</p>
            <p className="text-[13px] text-gray-500 leading-relaxed">{description}</p>

            {/* CTA */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[13px] font-medium text-blue-500">Apri modulo</span>
              <ArrowRight
                className="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition-transform duration-150"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
