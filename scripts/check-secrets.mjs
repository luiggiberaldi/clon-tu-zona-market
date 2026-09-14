import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=tracked.filter(file=>
  ((/(^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.env.example'))||
   /(^|\/)(?:\.workbuddy-ai|\.vercel|\.playwright-cli|outputs|node_modules|\.next)(?:\/|$)/.test(file)||
   /\.(?:sqlite(?:-wal|-shm)?|db|log|tsbuildinfo)$/i.test(file))
);
const patterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk_live_[A-Za-z0-9]{20,}/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}/,
  /\bgh[opusr]_[A-Za-z0-9]{25,}/,
  /\bgithub_pat_[A-Za-z0-9_]{25,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /postgres(?:ql)?:\/\/[^\s:'"/]+:[^\s@'"/]+@[^\s'"/]+/,
  /C:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)/
];
for(const file of tracked){
  if((!file.endsWith('.env.example')&&!/\.(?:ts|tsx|js|mjs|json|yml|yaml|env|md|toml|sql|ps1|sh)$/.test(file))||file==='scripts/check-secrets.mjs')continue;
  const text=fs.readFileSync(file,'utf8');
  if(patterns.some(pattern=>pattern.test(text)))forbidden.push(file);
  if(file.endsWith('.env.example')){
    for(const line of text.split(/\r?\n/)){
      const match=/^(?:SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|CRON_SECRET|RESEND_API_KEY|ADMIN_EMAIL)=(.*)$/.exec(line);
      if(match?.[1]?.trim())forbidden.push(file);
    }
  }
}
if(forbidden.length){
  console.error('Archivos que requieren revisión antes de publicar:',[...new Set(forbidden)].join(', '));
  process.exitCode=1;
}else console.log('Revisión aprobada: '+tracked.length+' archivos; sin entornos privados, bases, sesiones, registros, rutas personales ni patrones de claves reconocidos. Revisar manualmente credenciales nuevas.');
