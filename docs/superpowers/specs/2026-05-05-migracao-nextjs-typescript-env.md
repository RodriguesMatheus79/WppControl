# Migração para Next.js (TypeScript) + `.env.local` — Spec

**Data:** 2026-05-05  
**Projeto atual:** app estático (`index.html` + `styles.css` + `app.js`) servido por `http-server` (script `npm run dev`).

## Objetivo
Migrar o projeto atual para **Next.js (App Router)** em **TypeScript**, mantendo o comportamento e UI equivalentes ao app atual, e habilitar configuração via **`.env.local`** (preparando o terreno para a integração com Supabase na sequência).

## Fora de escopo (nesta etapa)
- Integração com Supabase (Auth/CRUD/Policies) no frontend.
- Alterações de UI/UX além do necessário para replicar o comportamento atual.
- SSR/SEO avançado (o app continuará essencialmente client-side, mas dentro da arquitetura do Next/React).

## Critérios de sucesso
- O app roda com `npm run dev` (Next) e abre a tela “Controle de Leads”.
- Funcionalidades existentes continuam funcionando:
  - Criar/editar/excluir lead
  - Filtro por etapa, busca, ordenação
  - Indicadores (Total, Abertos, Para hoje, Conversão)
  - Exportar/importar JSON
  - Persistência local (temporária) via `localStorage`
- O CSS mantém o visual equivalente ao atual.
- Existe `.env.local` com chaves públicas preparadas para Supabase (sem ainda usar no código):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Projeto com estrutura clara e tipada (TypeScript), pronto para substituir `localStorage` por Supabase em etapa posterior.

## Decisões técnicas
### Next.js
- Usar **Next.js App Router** (`app/`).
- CSS global em `app/globals.css` (migrado de `styles.css`).

### Estado e persistência (temporária)
- Estado do app ficará em React state (ex.: `useState` / `useMemo`).
- Persistência local continuará por enquanto em `localStorage`, encapsulada em um módulo (`src/lib/storage.ts`) para trocar depois por Supabase sem reescrever UI.

### Tipos
Criar tipos compartilhados para garantir consistência e facilitar migração posterior:
- `LeadStatus` (union de strings)
- `Interaction` (`{ text: string; date: string }`)
- `Lead` (modelo do app)

## Estrutura proposta de arquivos
### Criar
- `next.config.ts`
- `tsconfig.json` (gerado pelo Next)
- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css` (conteúdo do `styles.css`)
- `src/lib/types.ts`
- `src/lib/storage.ts`
- `src/lib/format.ts` (money, dateLabel, etc.)
- `src/lib/leads.ts` (seed, filtros/ordenação, helpers)
- `src/components/LeadApp.tsx` (container principal do app)
- `src/components/Sidebar.tsx`
- `src/components/Topbar.tsx`
- `src/components/Metrics.tsx`
- `src/components/LeadList.tsx`
- `src/components/LeadCard.tsx`
- `src/components/LeadDialog.tsx`
- `.env.local.example`

### Remover / deprecated
- `index.html` deixa de ser a entrypoint (pode ficar temporariamente no repo como referência; não usado pelo Next).
- `app.js` deixa de ser entrypoint; a lógica é portada para módulos TS/React.
- `styles.css` será migrado para `app/globals.css` (arquivo original pode ser removido ou mantido como referência temporária).

## Mapeamento do comportamento atual (para React)
### UI principal
- Sidebar com chips de status (filtro).
- Topbar com busca, export/import, botão “Novo lead”.
- Metrics (total, abertos, para hoje, conversão).
- Lista de leads (cards) com ações editar e link WhatsApp.
- Dialog para criar/editar lead.

### Regras e helpers (devem manter equivalência)
- Status e labels/tone idênticos ao array `statuses` atual.
- Persistência:
  - `STORAGE_KEY = "controle-leads:v1"`
  - `loadLeads()` com fallback para `seedLeads()`
  - `saveLeads()` sempre que houver alteração relevante
- Ordenação:
  - `updated-desc` (default)
  - `next-asc`
  - `name-asc`
  - `status-asc`
- Métricas:
  - `today`: `isTodayOrLate(nextContact)` e status não fechado/perdido
  - `conversion`: `closed/(closed+lost)` arredondado
- Import/export: JSON compatível com o formato atual.

## `.env.local` (preparação)
- Criar `.env.local.example` com placeholders:
  - `NEXT_PUBLIC_SUPABASE_URL=`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
- Criar `.gitignore` (se necessário) garantindo que `.env.local` não seja commitado.

## Riscos / cuidados
- **Datas**: `nextContact` hoje é string `YYYY-MM-DD`. Manter esse formato no modelo do app.
- **Números**: `value` no input é number; ao importar JSON pode vir string/number — normalizar.
- **Acessibilidade e comportamento do `<dialog>`**: em React, usar `dialog.showModal()`/`close()` via `ref`, mantendo fluxo atual.
- **Compatibilidade do `crypto.randomUUID()`**: browsers modernos ok; em caso de necessidade, usar fallback (mas manter como está por enquanto).

## Teste manual (checklist)
- Criar lead, salvar, atualizar página, confirmar persistência.
- Editar lead, confirmar `updatedAt` mudando e ordenação por “Atualizados primeiro”.
- Excluir lead.
- Filtro por status + busca.
- Ordenação por Nome, Etapa, Próximo contato.
- Exportar JSON e reimportar.

