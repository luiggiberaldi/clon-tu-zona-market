import 'server-only';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { hasSupabaseConfig,isDemoMode } from '@/lib/config';
export async function requirePageRole(roles:string[],destination='/admin'){
  if(!hasSupabaseConfig()&&!isDemoMode())redirect('/login?config=1');
  const supabase=await createServerSupabase();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)redirect('/login?redirect='+encodeURIComponent(destination));
  const {data:profile}=await supabase.from('users').select('role,full_name').eq('id',user.id).maybeSingle();
  if(!profile||!roles.includes(profile.role))redirect('/carabobo');
  if(profile.role==='admin'){
    const {data:level}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if(level?.currentLevel!=='aal2')redirect('/perfil/seguridad?required=1');
  }
  return {supabase,user,profile};
}
