import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { SearchBox } from './components/SearchBox';
import { DexPage } from './pages/DexPage';
import { SpeciesPage } from './pages/SpeciesPage';
import { SqlPage } from './pages/SqlPage';

export default function App() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <Routes>
          <Route path="/" element={<DexPage />} />
          <Route path="/pokemon/:id" element={<SpeciesPage />} />
          <Route path="/sql" element={<SqlPage />} />
          <Route path="*" element={<p className="py-20 text-center text-muted">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}

function Header() {
  // Carry the generation being viewed into search results so jumping between
  // species keeps you in the same game era.
  const [params] = useSearchParams();
  const gen = Number(params.get('gen')) || undefined;

  return (
    <header className="sticky top-0 z-10 border-b border-hair bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-2.5">
        <nav className="flex items-baseline gap-4">
          <Link to="/" className="font-display text-lg font-bold tracking-tight hover:text-accent">
            Pokédex
          </Link>
          <Link to="/sql" className="text-sm text-muted hover:text-accent">SQL</Link>
        </nav>
        <SearchBox gen={gen} />
      </div>
    </header>
  );
}
