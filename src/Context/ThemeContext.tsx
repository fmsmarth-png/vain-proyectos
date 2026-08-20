import { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

// ── Paleta centralizada ────────────────────────────────────────────────
// Todas las páginas deben leer sus colores desde aquí (usePalette / useTheme().palette)
// en lugar de hardcodear hex. Cambiar el estilo global = editar solo este objeto.
export interface Palette {
  // superficies
  bg: string;          // fondo de página
  panel: string;       // toolbar / barras
  card: string;        // tarjeta principal
  card2: string;       // tarjeta secundaria / relleno interno
  // líneas
  line: string;        // borde estándar
  lineSoft: string;    // borde/divisor tenue
  // texto
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // marca / acentos
  accent: string;      // teal principal
  accent2: string;     // azul
  gradA: string;       // inicio del gradiente de marca
  gradB: string;       // fin del gradiente de marca
  // acentos semánticos de KPI (adaptados por tema)
  kpiBlue: string;
  kpiRed: string;
  kpiAmber: string;
  kpiTeal: string;
  kpiGreen: string;
  kpiCyan: string;
  kpiPink: string;
  kpiPurple: string;
  kpiGray: string;
  // gradiente fijo del banner de proyecto (navy en ambos temas)
  projectGrad: string;
}

const darkPalette: Palette = {
  bg: '#0B1220',
  panel: '#0E1728',
  card: '#16233B',
  card2: '#1B2C48',
  line: '#243550',
  lineSoft: '#1B2A42',
  textPrimary: '#EAF2FB',
  textSecondary: '#8FA6C4',
  textMuted: '#5D728F',
  accent: '#25C9D0',
  accent2: '#3B82F6',
  gradA: '#25C9D0',
  gradB: '#2E6FE0',
  kpiBlue: '#3B82F6',
  kpiRed: '#F26D6D',
  kpiAmber: '#F0B44A',
  kpiTeal: '#25C9D0',
  kpiGreen: '#34D399',
  kpiCyan: '#38BDF8',
  kpiPink: '#F472B6',
  kpiPurple: '#A78BFA',
  kpiGray: '#6B7C93',
  projectGrad: 'linear-gradient(135deg, #132444 0%, #1C3E74 55%, #215FB0 100%)',
};

const lightPalette: Palette = {
  bg: '#EEF1F6',
  panel: '#FFFFFF',
  card: '#FFFFFF',
  card2: '#F4F7FB',
  line: '#E3E9F1',
  lineSoft: '#EDF1F6',
  textPrimary: '#12203A',
  textSecondary: '#5D708C',
  textMuted: '#94A3B7',
  accent: '#12B5BD',
  accent2: '#2E6FE0',
  gradA: '#22C4CC',
  gradB: '#2E6FE0',
  kpiBlue: '#2E6FE0',
  kpiRed: '#E1554F',
  kpiAmber: '#D99420',
  kpiTeal: '#12B5BD',
  kpiGreen: '#0FA968',
  kpiCyan: '#0E9BD6',
  kpiPink: '#DB4B8F',
  kpiPurple: '#8B5CF6',
  kpiGray: '#94A3B7',
  projectGrad: 'linear-gradient(135deg, #132444 0%, #1C3E74 55%, #215FB0 100%)',
};

export const palettes: Record<Theme, Palette> = {
  dark: darkPalette,
  light: lightPalette,
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  palette: Palette;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  palette: darkPalette,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('tema') as Theme) ?? 'dark';
  });

  useEffect(() => {
    localStorage.setItem('tema', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const palette = palettes[theme];

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, palette }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

// Atajo cómodo para páginas que solo necesitan los colores.
export const usePalette = () => useContext(ThemeContext).palette;