import { useAuthStore } from '../store/authStore';

/**
 * Who sees the Question Bank Manager (and the Author Studio link).
 *
 * THIS IS CLIENT-SIDE VISIBILITY, NOT AUTHORIZATION. Hiding a screen stops honest users from stumbling into it; it does not stop anyone
 * who edits the page's JavaScript. What really protects the shared question bank is outside the browser:
 *  • publishing needs a GitHub token with write access to the repository — GitHub enforces that, and ordinary users never have one;
 *  • local imports only ever change the importer's own device.
 * `isAdmin` is the existing server-side role (profiles.role = 'admin', read through Supabase). A self-hosted / personal build with no
 * accounts can set VITE_QUESTION_BANK_MANAGER=true to show the manager to everyone using that build (it is still only the local import
 * and the GitHub token that do anything).
 */
export function useQuestionBankAccess(): { canManage: boolean; isAdmin: boolean; personalBuild: boolean } {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const personalBuild = import.meta.env?.VITE_QUESTION_BANK_MANAGER === 'true';
  return { canManage: isAdmin || personalBuild, isAdmin, personalBuild };
}
