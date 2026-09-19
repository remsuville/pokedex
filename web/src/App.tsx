import { NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { SearchBox } from './components/SearchBox';
import { DexPage } from './pages/DexPage';
import { SpeciesPage } from './pages/SpeciesPage';
import { MoveDexPage } from './pages/MoveDexPage';
import { MovePage } from './pages/MovePage';
import { AbilityDexPage } from './pages/AbilityDexPage';
import { AbilityPage } from './pages/AbilityPage';
import { ItemDexPage } from './pages/ItemDexPage';
import { ItemPage } from './pages/ItemPage';
import { SqlPage } from './pages/SqlPage';

export default function App() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <Routes>
          <Route path="/" element={<DexPage />} />
          <Route path="/pokemon/:id" element={<SpeciesPage />} />
          <Route path="/moves" element={<MoveDexPage />} />
          <Route path="/move/:id" element={<MovePage />} />
          <Route path="/abilities" element={<AbilityDexPage />} />
          <Route path="/ability/:id" element={<AbilityPage />} />
          <Route path="/items" element={<ItemDexPage />} />
          <Route path="/item/:id" element={<ItemPage />} />
          <Route path="/sql" element={<SqlPage />} />
          <Route path="*" element={<p className="py-20 text-center text-muted">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}

/** Each dex has a list route and a detail route; the nav link lights up for both. */
const NAV: { to: string; label: string; detail: string }[] = [
  { to: '/moves', label: 'Moves', detail: '/move/' },
  { to: '/abilities', label: 'Abilities', detail: '/ability/' },
  { to: '/items', label: 'Items', detail: '/item/' },
  { to: '/sql', label: 'SQL', detail: '\0' },
];

function Header() {
  // Carry the generation being viewed into search results so jumping between
  // pages keeps you in the same game era.
  const [params] = useSearchParams();
  const gen = Number(params.get('gen')) || undefined;
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-10 border-b border-hair bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-2.5">
        <nav className="flex items-baseline gap-4">
          <NavLink to="/" className="font-display text-lg font-bold tracking-tight hover:text-accent">
            Pokédex
          </NavLink>
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `text-sm hover:text-accent ${isActive || pathname.startsWith(n.detail) ? 'font-medium text-ink' : 'text-muted'}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <SearchBox gen={gen} />
      </div>
    </header>
  );
}
