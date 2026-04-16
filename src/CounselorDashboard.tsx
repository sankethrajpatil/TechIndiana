import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import {
  BookOpen,
  Moon,
  Sun,
  LogOut,
  ArrowLeft,
  Users,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Loader2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface StudentProfile {
  firebaseUid: string;
  email?: string;
  name?: string;
  background?: string;
  expectations?: string;
  study_plan?: string;
  assigned_counselor?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function CounselorDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

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
          const token = await u.getIdToken();
          const res = await fetch('/api/profile', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUserRole(data.profile?.role || 'student');
          }
        } catch {
          setUserRole('student');
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && user && userRole && userRole !== 'counselor' && userRole !== 'admin') {
      setAccessDenied(true);
    }
    if (!loading && !user) {
      navigate('/', { replace: true });
    }
  }, [loading, user, userRole, navigate]);

  useEffect(() => {
    if (user && (userRole === 'counselor' || userRole === 'admin')) {
      fetchStudents();
    }
  }, [user, userRole]);

  const fetchStudents = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/counselor/students', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students);
      } else if (res.status === 403) {
        setError('Access denied. You do not have counselor permissions.');
      } else {
        setError('Failed to load students.');
      }
    } catch {
      setError('Failed to connect to server.');
    }
  };

  const handleAssign = async (studentUid: string) => {
    if (!user) return;
    setAssigning(studentUid);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/counselor/assign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentUid }),
      });
      if (res.ok) {
        await fetchStudents();
      }
    } catch {
      setError('Failed to assign student.');
    } finally {
      setAssigning(null);
    }
  };

  const handleUnassign = async (studentUid: string) => {
    if (!user) return;
    setAssigning(studentUid);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/counselor/unassign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentUid }),
      });
      if (res.ok) {
        await fetchStudents();
      }
    } catch {
      setError('Failed to unassign student.');
    } finally {
      setAssigning(null);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (filter === 'mine') return s.assigned_counselor === user?.uid;
    if (filter === 'unassigned') return !s.assigned_counselor;
    return true;
  });

  const parseStudyPlan = (raw: string | undefined) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A4F76]" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans flex items-center justify-center px-6">
        <div className="text-center space-y-6 max-w-lg">
          <div className="w-24 h-24 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-12 h-12 text-orange-500" />
          </div>
          <h2 className="text-3xl font-black tracking-tight">
            Whoa there, overachiever! 🎓
          </h2>
          <p className="text-[var(--text-secondary)] text-lg leading-relaxed">
            Looks like you tried to sneak into the <span className="font-bold text-[#4A4F76]">Counselor Portal</span>,
            but your account is set up as a <span className="font-bold text-blue-600">student</span>.
            That's like bringing a backpack to a teacher's lounge — bold move, but no dice.
          </p>
          <p className="text-[var(--text-secondary)]">
            If you <em>are</em> a counselor, ask your administrator to grant you access.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link
              to="/"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 justify-center"
            >
              <Sparkles className="w-4 h-4" />
              Explore My Future Instead
            </Link>
            <button
              onClick={() => { auth.signOut(); navigate('/'); }}
              className="border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans">
      {/* Header */}
      <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-[#4A4F76]" />
            <h1 className="text-2xl font-black tracking-tight">Counselor Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link to="/" className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <button
              onClick={async () => { await auth.signOut(); navigate('/', { replace: true }); }}
              className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
            {error}
            <button onClick={() => setError(null)} className="ml-3 underline">Dismiss</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
            <div className="flex items-center gap-3 mb-1">
              <Users className="w-5 h-5 text-[#4A4F76]" />
              <span className="text-sm text-[var(--text-secondary)]">Total Students</span>
            </div>
            <p className="text-3xl font-bold">{students.length}</p>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
            <div className="flex items-center gap-3 mb-1">
              <UserPlus className="w-5 h-5 text-green-600" />
              <span className="text-sm text-[var(--text-secondary)]">My Students</span>
            </div>
            <p className="text-3xl font-bold">{students.filter(s => s.assigned_counselor === user?.uid).length}</p>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
            <div className="flex items-center gap-3 mb-1">
              <GraduationCap className="w-5 h-5 text-amber-500" />
              <span className="text-sm text-[var(--text-secondary)]">With Study Plans</span>
            </div>
            <p className="text-3xl font-bold">{students.filter(s => s.study_plan).length}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {(['all', 'mine', 'unassigned'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-[#4A4F76] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
              }`}
            >
              {f === 'all' ? 'All Students' : f === 'mine' ? 'My Students' : 'Unassigned'}
            </button>
          ))}
        </div>

        {/* Student List */}
        <div className="space-y-3">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No students found for this filter.</p>
            </div>
          ) : (
            filteredStudents.map((student) => {
              const isExpanded = expandedStudent === student.firebaseUid;
              const plan = parseStudyPlan(student.study_plan);
              const isMine = student.assigned_counselor === user?.uid;
              const isAssigned = !!student.assigned_counselor;

              return (
                <div
                  key={student.firebaseUid}
                  className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden"
                >
                  {/* Student row */}
                  <div
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                    onClick={() => setExpandedStudent(isExpanded ? null : student.firebaseUid)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#4A4F76] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {(student.name || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{student.name || 'Unnamed Student'}</p>
                        <p className="text-sm text-[var(--text-secondary)] truncate">{student.email || 'No email'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {plan && (
                        <span className="hidden sm:inline-block px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                          Has Plan
                        </span>
                      )}
                      {isMine && (
                        <span className="hidden sm:inline-block px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                          Assigned to You
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-[var(--border-color)] pt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Background</h4>
                          <p className="text-sm">{student.background || '—'}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Expectations</h4>
                          <p className="text-sm">{student.expectations || '—'}</p>
                        </div>
                      </div>

                      {/* Study Plan */}
                      {plan ? (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-2">
                            Study Plan: {plan.plan_title || 'Untitled'}
                          </h4>
                          {plan.milestones && (
                            <div className="space-y-2">
                              {plan.milestones.map((m: any, i: number) => (
                                <div key={i} className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm">
                                  <p className="font-medium">{m.date} — {m.topic}</p>
                                  {m.action_items && (
                                    <ul className="mt-1 ml-4 list-disc text-[var(--text-secondary)]">
                                      {m.action_items.map((a: string, j: number) => (
                                        <li key={j}>{a}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {plan.videos && plan.videos.length > 0 && (
                            <div className="mt-3">
                              <h5 className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">YouTube Resources</h5>
                              <div className="flex flex-wrap gap-2">
                                {plan.videos.map((v: any, i: number) => (
                                  <a
                                    key={i}
                                    href={v.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                  >
                                    ▶ {v.skill}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)] italic">No study plan generated yet.</p>
                      )}

                      {/* Assign / Unassign */}
                      <div className="flex gap-2 pt-2">
                        {!isMine && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAssign(student.firebaseUid); }}
                            disabled={assigning === student.firebaseUid}
                            className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-[#4A4F76] text-white rounded-lg hover:bg-[#3a3f66] disabled:opacity-50 transition-colors"
                          >
                            {assigning === student.firebaseUid ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <UserPlus className="w-4 h-4" />
                            )}
                            Assign to Me
                          </button>
                        )}
                        {isMine && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUnassign(student.firebaseUid); }}
                            disabled={assigning === student.firebaseUid}
                            className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {assigning === student.firebaseUid ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <UserMinus className="w-4 h-4" />
                            )}
                            Unassign
                          </button>
                        )}
                        {isAssigned && !isMine && (
                          <span className="flex items-center text-sm text-[var(--text-secondary)]">
                            Assigned to another counselor
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
