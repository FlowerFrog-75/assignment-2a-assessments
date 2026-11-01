import { useState } from 'react';
import type { Page } from './types';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import LoginPage from './pages/LoginPage';
import AssessmentTemplatePage from './pages/AssessmentTemplatePage';
import StudentDashboard from './pages/StudentDashboard';
import AssessmentInterface from './pages/AssessmentInterface';
import ResultsInterface from './pages/ResultsInterface';
import DigitalWallet from './pages/DigitalWallet';
import PublicVerification from './pages/PublicVerification';
import TeacherClassResults from './pages/TeacherClassResults';
import TeacherIndividualResults from './pages/TeacherIndividualResults';
import AccessLogging from './pages/AccessLogging';
import LedgerDemo from './pages/LedgerDemo';

const fullscreenPages: Page[] = ['login', 'public-verification', 'assessment-interface'];

export default function App() {
  const [page, setPage] = useState<Page>('login');

  const isFullscreen = fullscreenPages.includes(page);

  const renderPage = () => {
    switch (page) {
      case 'login': return <LoginPage setPage={setPage} />;
      case 'assessment-template': return <AssessmentTemplatePage setPage={setPage} />;
      case 'student-dashboard': return <StudentDashboard setPage={setPage} />;
      case 'assessment-interface': return <AssessmentInterface setPage={setPage} />;
      case 'results-interface': return <ResultsInterface setPage={setPage} />;
      case 'digital-wallet': return <DigitalWallet setPage={setPage} />;
      case 'public-verification': return <PublicVerification setPage={setPage} />;
      case 'teacher-class': return <TeacherClassResults setPage={setPage} />;
      case 'teacher-individual': return <TeacherIndividualResults setPage={setPage} />;
      case 'access-logging': return <AccessLogging setPage={setPage} />;
      case 'blockchain-ledger': return <LedgerDemo setPage={setPage} />;
      default: return <LoginPage setPage={setPage} />;
    }
  };

  if (isFullscreen) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        {renderPage()}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FC]">
      <Sidebar currentPage={page} setPage={setPage} />
      <div className="flex-1 ml-64">
        <TopNav currentPage={page} setPage={setPage} />
        <main className="mt-14 min-h-[calc(100vh-56px)] overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
