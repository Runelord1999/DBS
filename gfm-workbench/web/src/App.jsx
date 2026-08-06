import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { Layout } from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Portfolio from './pages/Portfolio.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import RagDashboard from './pages/RagDashboard.jsx';
import Budget from './pages/Budget.jsx';
import Capacity from './pages/Capacity.jsx';
import Demand from './pages/Demand.jsx';
import DemandDetail from './pages/DemandDetail.jsx';
import PscPack from './pages/PscPack.jsx';
import MyAllocations from './pages/MyAllocations.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Loading label="Loading workbench…" />;
  if (!user) return <Login />;

  // A resourced team member's home is their own allocations, not the exec
  // summary — the screens differ by role by design, not by filter.
  const home = user.accessRole === 'resource' ? '/my-allocations' : '/';

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={user.accessRole === 'resource' ? <Navigate to="/my-allocations" replace /> : <Home />}
        />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/rag" element={<RagDashboard />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/capacity" element={<Capacity />} />
        <Route path="/demand" element={<Demand />} />
        <Route path="/demand/:id" element={<DemandDetail />} />
        <Route path="/psc-pack" element={<PscPack />} />
        <Route path="/my-allocations" element={<MyAllocations />} />
        <Route
          path="/admin"
          element={user.accessRole === 'admin' ? <Admin /> : <Navigate to={home} replace />}
        />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
