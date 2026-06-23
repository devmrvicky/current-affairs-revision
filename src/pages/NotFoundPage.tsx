import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Compass, Home, Search } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center max-w-sm"
      >
        <div className="w-20 h-20 rounded-3xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mx-auto mb-6">
          <Compass size={36} className="text-brand-500" />
        </div>
        <h1 className="text-5xl font-display font-bold mb-2" style={{ color: 'var(--text-primary)' }}>404</h1>
        <h2 className="text-lg font-display font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Page Not Found
        </h2>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate('/')}
            className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <Home size={15} /> Back to Home
          </button>
          <button
            onClick={() => navigate('/chapter-wise-current-affairs')}
            className="btn-secondary flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <Search size={15} /> Search Chapters
          </button>
        </div>
      </motion.div>
    </div>
  );
}
