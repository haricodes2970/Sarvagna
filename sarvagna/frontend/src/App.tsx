import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SubjectPage from './pages/SubjectPage'
import RoadmapPage from './pages/RoadmapPage'
import FlashcardPage from './pages/FlashcardPage'
import ProgressPage from './pages/ProgressPage'
import UploadPage from './pages/UploadPage'
import QPAnalyzerPage from './pages/QPAnalyzerPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/subjects/:subjectId" element={<SubjectPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/flashcards" element={<FlashcardPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/qp-analyzer" element={<QPAnalyzerPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
