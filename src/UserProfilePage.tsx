import { useState, useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  BookOpen,
  Moon,
  Sun,
  LogOut,
  ArrowLeft,
  Mail,
  ShieldCheck,
  Calendar,
  Fingerprint,
  Sparkles,
} from 'lucide-react';
import { auth, db } from './firebase';

function formatFirebaseDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [firestoreExtras, setFirestoreExtras] = useState<Record<string, unknown> | null>(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid));
          setFirestoreExtras(snap.exists() ? snap.data() : null);
        } catch {
          setFirestoreExtras(null);
        }
      } else {
        setFirestoreExtras(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/', { replace: true });
    }
  }, [loading, user, navigate]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/', { replace: true });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center font-sans">
        <p className="text-[var(--text-secondary)] text-sm">Loading profile…</p>
      </div>
    );
  }

  const displayName = user.displayName?.trim() || user.email || 'Your account';
  const primaryEmail = user.email ?? '—';
  const phone = user.phoneNumber ?? '—';
  const photoURL = user.photoURL;
  const providerLabel =
    user.providerData[0]?.providerId === 'google.com'
      ? 'Google'
      : user.providerData[0]?.providerId ?? '—';

  const studyPlanRaw = firestoreExtras?.study_plan;
  let studyPlanSummary: string | null = null;
  if (typeof studyPlanRaw === 'string' && studyPlanRaw.trim()) {
    if (studyPlanRaw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(studyPlanRaw) as { plan_title?: string };
        studyPlanSummary = parsed.plan_title ?? 'Study plan on file';
      } catch {
        studyPlanSummary = 'Study plan on file';
      }
    } else {
      studyPlanSummary = studyPlanRaw.slice(0, 120) + (studyPlanRaw.length > 120 ? '…' : '');
    }
  }

  const rows: { label: string; value: string; icon?: ReactNode }[] = [
    { label: 'Email', value: primaryEmail, icon: <Mail className="w-4 h-4" /> },
    { label: 'Phone', value: phone },
    {
      label: 'Email verified',
      value: user.emailVerified ? 'Yes' : 'No',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    {
      label: 'Account created',
      value: formatFirebaseDate(user.metadata.creationTime),
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      label: 'Last sign-in',
      value: formatFirebaseDate(user.metadata.lastSignInTime),
      icon: <Calendar className="w-4 h-4" />,
    },
    { label: 'Sign-in provider', value: providerLabel },
    {
      label: 'User ID',
      value: user.uid,
      icon: <Fingerprint className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans selection:bg-ai-purple/30">
      <header className="border-b border-[var(--border-color)] px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Advisor</span>
          </Link>
          <div className="h-8 w-px bg-[var(--border-color)] hidden sm:block" aria-hidden />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 bg-ai-purple rounded-lg flex items-center justify-center shadow-lg shadow-ai-purple/20 shrink-0">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">TechIndiana</h1>
              <p className="text-[10px] uppercase tracking-widest text-ai-purple font-black">Your profile</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
            title="Toggle theme"
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 text-slate-600" />
            ) : (
              <Sun className="w-5 h-5 text-yellow-400" />
            )}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors group"
            title="Logout"
          >
            <LogOut className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-3xl p-8 shadow-xl ai-card space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="shrink-0 mx-auto sm:mx-0">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt=""
                  className="w-24 h-24 rounded-2xl object-cover ring-2 ring-ai-purple/30"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-ai-purple/15 flex items-center justify-center text-2xl font-black text-ai-purple">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="text-center sm:text-left flex-1 min-w-0">
              <h2 className="text-3xl font-black tracking-tight text-[var(--text-primary)] break-words">
                {displayName}
              </h2>
              <p className="text-[var(--text-secondary)] text-sm mt-1">Signed in with {providerLabel}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4">
              Contact & account
            </h3>
            <dl className="space-y-0 divide-y divide-[var(--border-color)] rounded-2xl border border-[var(--border-color)] overflow-hidden bg-[var(--bg-primary)]/50">
              {rows.map(({ label, value, icon }) => (
                <div
                  key={label}
                  className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3.5"
                >
                  <dt className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)] sm:w-40 shrink-0 flex items-center gap-2">
                    {icon}
                    {label}
                  </dt>
                  <dd className="text-sm font-medium break-all sm:flex-1">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {studyPlanSummary && (
            <div className="rounded-2xl border border-ai-purple/25 bg-ai-purple/5 p-5 space-y-2">
              <div className="flex items-center gap-2 text-ai-purple">
                <Sparkles className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-widest">Study plan</h3>
              </div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{studyPlanSummary}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Full plan stays on your advisor home screen.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-[var(--text-secondary)]">
          <Link to="/" className="text-blue-600 hover:text-blue-700 font-semibold underline-offset-4 hover:underline">
            Back to Academic Advisor
          </Link>
        </p>
      </main>

      <style>{`
        .ai-card {
          backdrop-filter: blur(8px);
          transition: all 0.3s ease;
        }
        .dark .ai-card:hover {
          border-color: rgba(74, 79, 118, 0.4);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}
