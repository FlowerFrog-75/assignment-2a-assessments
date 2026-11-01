import { useEffect, useState } from 'react';
import type { Page } from './types';
import { AuthProvider, useAuth } from './lib/auth';
import { canOpen, homePage, PAGES } from './lib/pages';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import AssessmentTemplatePage from './pages/AssessmentTemplatePage';
import TemplateEditor from './pages/TemplateEditor';
import ItemBank from './pages/ItemBank';
import Marking from './pages/Marking';
import StudentDashboard from './pages/StudentDashboard';
import StudentAssessments from './pages/StudentAssessments';
import AssessmentInterface from './pages/AssessmentInterface';
import ResultsInterface from './pages/ResultsInterface';
import DigitalWallet from './pages/DigitalWallet';
import Privacy from './pages/Privacy';
import PublicVerification from './pages/PublicVerification';
import TeacherClassResults from './pages/TeacherClassResults';
import TeacherIndividualResults from './pages/TeacherIndividualResults';
import AccessLogging from './pages/AccessLogging';
import LedgerOverview from './pages/LedgerOverview';
import AdminOverview from './pages/AdminOverview';
import AdminUsers from './pages/AdminUsers';
import AdminClasses from './pages/AdminClasses';
import AdminSchool from './pages/AdminSchool';
import AdminCoins from './pages/AdminCoins';

/** Shared verification links look like https://wallet.school/verify/K7Q2-M9XD-4PLA */
function isVerifyLink() {
  return window.location.pathname.startsWith('/verify');
}

/** The page in the address bar, e.g. #/digital-wallet, so refresh and the back button work. */
function pageFromHash(): Page | null {
  const name = window.location.hash.replace(/^#\/?/, '');
  return name in PAGES ? (name as Page) : null;
}

function Shell() {
  const { state } = useAuth();
  const [page, setPageState] = useState<Page>(() => pageFromHash() ?? 'login');
  const [publicVerify, setPublicVerify] = useState(isVerifyLink);

  const setPage = (next: Page) => {
    if (next === 'public-verification' && state.status !== 'signed-in') {
      setPublicVerify(true);
      return;
    }
    if (next !== 'login' && window.location.hash !== `#/${next}`) window.location.hash = `/${next}`;
    setPageState(next);
    window.scrollTo(0, 0);
  };

  // Back and forward buttons.
  useEffect(() => {
    const onHashChange = () => {
      const next = pageFromHash();
      if (next) setPageState(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // After sign-in (or a role change), stay on the requested page if allowed, else go home.
  const role = state.status === 'signed-in' ? state.user.role : null;
  useEffect(() => {
    if (role) setPageState((current) => (canOpen(role, current) ? current : homePage(role)));
    else setPageState((current) => (state.status === 'loading' ? current : 'login'));
  }, [role, state.status]);

  // Keep the address bar in step when the app redirects (e.g. to the home page).
  useEffect(() => {
    if (role && page !== 'login' && canOpen(role, page) && window.location.hash !== `#/${page}`) {
      window.history.replaceState(null, '', `#/${page}`);
    }
  }, [role, page]);

  if (publicVerify) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <PublicVerification
          setPage={(p) => {
            if (isVerifyLink()) window.history.replaceState(null, '', '/');
            setPublicVerify(false);
            if (p !== 'login') setPage(p);
          }}
        />
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC] text-gray-400 text-sm gap-3">
        <span className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  if (state.status === 'signed-out') return <LoginPage setPage={setPage} />;

  // New accounts: choose a password (and staff set up 2FA) before anything else.
  if (state.user.setupRequired) return <AccountPage setPage={setPage} setup />;

  const current: Page = canOpen(state.user.role, page) ? page : homePage(state.user.role);

  const renderPage = () => {
    switch (current) {
      case 'account': return <AccountPage setPage={setPage} />;
      case 'student-dashboard': return <StudentDashboard setPage={setPage} />;
      case 'student-assessments': return <StudentAssessments setPage={setPage} />;
      case 'assessment-interface': return <AssessmentInterface setPage={setPage} />;
      case 'results-interface': return <ResultsInterface setPage={setPage} />;
      case 'digital-wallet': return <DigitalWallet setPage={setPage} />;
      case 'privacy': return <Privacy setPage={setPage} />;
      case 'public-verification': return <PublicVerification setPage={setPage} />;
      case 'teacher-class': return <TeacherClassResults setPage={setPage} />;
      case 'teacher-individual': return <TeacherIndividualResults setPage={setPage} />;
      case 'marking': return <Marking setPage={setPage} />;
      case 'assessment-template': return <AssessmentTemplatePage setPage={setPage} />;
      case 'template-editor': return <TemplateEditor setPage={setPage} />;
      case 'item-bank': return <ItemBank setPage={setPage} />;
      case 'access-logging': return <AccessLogging setPage={setPage} />;
      case 'admin-overview': return <AdminOverview setPage={setPage} />;
      case 'admin-users': return <AdminUsers setPage={setPage} />;
      case 'admin-classes': return <AdminClasses setPage={setPage} />;
      case 'admin-school': return <AdminSchool setPage={setPage} />;
      case 'admin-coins': return <AdminCoins setPage={setPage} />;
      case 'blockchain-ledger': return <LedgerOverview setPage={setPage} />;
      default: return null;
    }
  };

  if (current !== 'login' && PAGES[current].fullscreen) {
    return <div className="min-h-screen bg-[#F8F9FC]">{renderPage()}</div>;
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FC]">
      <Sidebar currentPage={current} setPage={setPage} />
      <div className="flex-1 ml-64 min-w-0">
        <TopNav currentPage={current} setPage={setPage} />
        <main key={current} className="mt-14 min-h-[calc(100vh-56px)] overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
