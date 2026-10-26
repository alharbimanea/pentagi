-- The bucket has no storage.objects policies on purpose: clients never touch
-- it directly. The server authorizes each request against public.files and
-- hands out a short-lived signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-files', 'order-files', false, 26214400, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/webp'
])
on conflict (id) do nothing;

-- Realtime delivers postgres_changes only for rows the subscriber can select,
-- so these tables stream under the same RLS as a normal query.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.messages, public.conversation_reads, public.notifications, public.orders;

insert into public.app_config (key, value) values
  ('require_admin_mfa', 'true'),
  ('revision_window_days', '14'),
  ('quote_validity_days', '7'),
  ('express_enabled', 'true'),
  ('contractors_enabled', 'false'),
  ('ai_assist_enabled', 'false'),
  ('crypto_payments_enabled', 'false'),
  ('policy_versions', '{"terms": "2026-10-26", "privacy": "2026-10-26", "acceptable_use": "2026-10-26"}')
on conflict (key) do nothing;

insert into public.services (slug, category, name_en, name_ar, description_en, description_ar, unit,
                             base_price_sar, base_price_usd, min_price_sar, min_price_usd, default_turnaround_hours, revisions_included, sort_order)
values
  ('research-consulting', 'consulting', 'Research consulting', 'استشارات بحثية',
   'One-to-one sessions on research questions, scope and planning.', 'جلسات فردية حول أسئلة البحث ونطاقه وتخطيطه.',
   'hour', 250, 67, 250, 67, 72, 0, 10),
  ('literature-review-support', 'research', 'Literature search & synthesis', 'البحث في الأدبيات وتوليفها',
   'Structured search strategy, annotated sources and a synthesis map for your own review.', 'استراتيجية بحث منظمة ومصادر مشروحة وخريطة توليف لمراجعتك الخاصة.',
   'word', 0.30, 0.08, 400, 107, 168, 1, 20),
  ('methodology-coaching', 'consulting', 'Research design & methodology coaching', 'التوجيه في تصميم البحث ومنهجيته',
   'Feedback on design, sampling, instruments and ethics documentation.', 'ملاحظات على التصميم والعينة والأدوات ووثائق الأخلاقيات.',
   'hour', 280, 75, 280, 75, 72, 0, 30),
  ('data-analysis', 'analysis', 'Statistical & data-analysis assistance', 'المساعدة في التحليل الإحصائي وتحليل البيانات',
   'Analysis plans, reproducible scripts and plain-language interpretation of your data.', 'خطط تحليل ونصوص قابلة لإعادة التنفيذ وتفسير مبسط لبياناتك.',
   'hour', 300, 80, 600, 160, 120, 1, 40),
  ('editing-proofreading', 'editing', 'Editing & proofreading', 'التحرير والتدقيق اللغوي',
   'Language, clarity, consistency and citation-format editing of your own text.', 'تحرير اللغة والوضوح والاتساق وتنسيق الاستشهادات لنصك الخاص.',
   'word', 0.12, 0.032, 150, 40, 72, 1, 50),
  ('translation', 'language', 'Translation (Arabic ⇄ English)', 'الترجمة (عربي ⇄ إنجليزي)',
   'Professional translation of documents you own or are authorized to translate.', 'ترجمة احترافية لوثائق تملكها أو مخوَّل بترجمتها.',
   'word', 0.25, 0.067, 200, 53, 96, 1, 60),
  ('citation-management', 'editing', 'Citation management', 'إدارة الاستشهادات',
   'Reference-library clean-up and style conversion (APA, MLA, Chicago, IEEE, Harvard, Vancouver).', 'تنظيم مكتبة المراجع وتحويل الأسلوب.',
   'page', 15, 4, 150, 40, 48, 1, 70),
  ('professional-reports', 'professional', 'Professional reports & presentations', 'التقارير والعروض التقديمية المهنية',
   'Business and policy reports, briefs and slide decks for organizations.', 'تقارير الأعمال والسياسات والملخصات والعروض للمؤسسات.',
   'page', 120, 32, 600, 160, 120, 2, 80),
  ('educational-exemplars', 'learning', 'Educational exemplars', 'نماذج تعليمية',
   'Annotated model answers for study and learning only — not for submission.', 'نماذج مشروحة للدراسة والتعلم فقط — وليست للتسليم.',
   'page', 90, 24, 300, 80, 120, 1, 90)
on conflict (slug) do nothing;

insert into public.pricing_rules (kind, code, label_en, label_ar, multiplier, min_hours, max_hours, sort_order) values
  ('level', 'general', 'General / professional', 'عام / مهني', 1.000, null, null, 10),
  ('level', 'undergraduate', 'Undergraduate', 'بكالوريوس', 1.000, null, null, 20),
  ('level', 'masters', 'Master''s', 'ماجستير', 1.150, null, null, 30),
  ('level', 'doctoral', 'Doctoral / specialist', 'دكتوراه / متخصص', 1.300, null, null, 40),
  ('complexity', 'standard', 'Standard', 'قياسي', 1.000, null, null, 10),
  ('complexity', 'technical', 'Technical', 'تقني', 1.200, null, null, 20),
  ('complexity', 'specialist', 'Highly specialized', 'متخصص للغاية', 1.400, null, null, 30),
  ('deadline', 'rush_24h', 'Under 24 hours', 'أقل من 24 ساعة', 1.800, 0, 24, 10),
  ('deadline', 'express_72h', '24–72 hours', 'من 24 إلى 72 ساعة', 1.400, 24, 72, 20),
  ('deadline', 'priority_7d', '3–7 days', 'من 3 إلى 7 أيام', 1.150, 72, 168, 30),
  ('deadline', 'standard', '7 days or more', '7 أيام أو أكثر', 1.000, 168, null, 40)
on conflict do nothing;

insert into public.pricing_rules (kind, code, label_en, label_ar, flat_sar, flat_usd, sort_order) values
  ('addon', 'plagiarism_report', 'Originality report on delivered work', 'تقرير الأصالة للعمل المسلَّم', 60, 16, 10),
  ('addon', 'video_walkthrough', 'Recorded walkthrough (20 min)', 'شرح مسجل (20 دقيقة)', 150, 40, 20),
  ('addon', 'bilingual_summary', 'Bilingual executive summary', 'ملخص تنفيذي ثنائي اللغة', 120, 32, 30)
on conflict do nothing;
