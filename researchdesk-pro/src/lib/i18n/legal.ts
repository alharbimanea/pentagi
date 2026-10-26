import type { Locale } from "@/lib/i18n";

export const POLICY_SLUGS = ["terms", "privacy", "integrity", "acceptable-use", "revisions", "refunds"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const POLICY_VERSION = "2026-10-26";

interface Section {
  heading: string;
  paragraphs: string[];
}

type PolicyText = Record<Locale, Section[]>;

export const policies: Record<PolicySlug, PolicyText> = {
  terms: {
    en: [
      {
        heading: "The service",
        paragraphs: [
          "ResearchDesk Pro provides research consulting, literature search and synthesis, methodology coaching, data-analysis assistance, citation management, editing, proofreading, translation, professional reports, presentations and educational exemplars.",
          "Every order is reviewed by the owner before it is accepted. Submitting an order or seeing an estimate does not create an obligation to deliver; a binding agreement exists only once you accept a quote and the payment is confirmed by our payment provider.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "You confirm that the information and files you provide are yours or that you are authorized to share them, and that your intended use complies with the academic integrity and acceptable use policies.",
          "You are responsible for complying with the rules of your institution, employer or publisher.",
        ],
      },
      {
        heading: "Payment",
        paragraphs: [
          "Payments are accepted online only through our payment provider. We do not accept bank transfers, wire transfers or cash deposits, and we never ask you to send money to a bank account.",
          "Prices are shown in Saudi riyals or US dollars. Your bank may apply its own conversion or foreign-transaction fees.",
        ],
      },
      {
        heading: "Delivery and ownership",
        paragraphs: [
          "Delivery dates are estimates confirmed in your quote. On full payment you receive a licence to use the deliverables for the purpose stated in your order.",
          "Liability is limited to the amount you paid for the order concerned, except where the law does not permit such a limitation.",
        ],
      },
      {
        heading: "Governing law",
        paragraphs: [
          "These terms are governed by the laws of the Kingdom of Saudi Arabia. Mandatory consumer protections of your country of residence are not affected.",
        ],
      },
    ],
    ar: [
      {
        heading: "الخدمة",
        paragraphs: [
          "تقدّم ResearchDesk Pro الاستشارات البحثية، والبحث في الأدبيات وتوليفها، والتوجيه المنهجي، والمساعدة في تحليل البيانات، وإدارة الاستشهادات، والتحرير، والتدقيق اللغوي، والترجمة، والتقارير المهنية، والعروض التقديمية، والنماذج التعليمية.",
          "يراجع المالك كل طلب قبل قبوله. لا يُنشئ إرسال الطلب أو الاطلاع على التقدير التزاماً بالتسليم؛ ولا ينشأ اتفاق ملزم إلا بعد قبولك عرض السعر وتأكيد مزوّد الدفع للدفعة.",
        ],
      },
      {
        heading: "مسؤولياتك",
        paragraphs: [
          "تؤكد أن المعلومات والملفات التي تقدمها مملوكة لك أو أنك مخوَّل بمشاركتها، وأن استخدامك المقصود يتوافق مع سياستي النزاهة الأكاديمية والاستخدام المقبول.",
          "أنت مسؤول عن الالتزام بأنظمة مؤسستك التعليمية أو جهة عملك أو الناشر.",
        ],
      },
      {
        heading: "الدفع",
        paragraphs: [
          "يُقبل الدفع إلكترونياً فقط عبر مزوّد الدفع لدينا. لا نقبل التحويلات البنكية أو الحوالات أو الإيداعات النقدية، ولا نطلب منك أبداً تحويل أموال إلى حساب بنكي.",
          "تُعرض الأسعار بالريال السعودي أو الدولار الأمريكي، وقد يفرض مصرفك رسوم تحويل أو رسوم معاملات أجنبية.",
        ],
      },
      {
        heading: "التسليم والملكية",
        paragraphs: [
          "مواعيد التسليم تقديرية وتُؤكَّد في عرض السعر. عند السداد الكامل تحصل على ترخيص باستخدام المخرجات للغرض المذكور في طلبك.",
          "تقتصر المسؤولية على المبلغ الذي دفعته مقابل الطلب المعني، إلا حيث لا يجيز النظام هذا التحديد.",
        ],
      },
      {
        heading: "القانون الحاكم",
        paragraphs: ["تخضع هذه الشروط لأنظمة المملكة العربية السعودية، دون الإخلال بالحمايات الإلزامية للمستهلك في بلد إقامتك."],
      },
    ],
  },
  privacy: {
    en: [
      {
        heading: "What we collect",
        paragraphs: [
          "Account details (name, email, optional phone), order details and files you upload, messages, payment records returned by our payment provider (never your full card number), and technical logs needed for security.",
        ],
      },
      {
        heading: "Why we use it",
        paragraphs: [
          "To deliver the service you ordered, to communicate with you, to meet accounting and legal obligations, and to protect the platform against abuse. Marketing messages are sent only with your consent.",
        ],
      },
      {
        heading: "Who processes it",
        paragraphs: [
          "Our hosting, database and storage provider, our email provider, our payment provider and, only if you opt in, an AI provider that receives a minimized text summary of your request without files or contact details. Some of these providers may process data outside Saudi Arabia; we rely on the safeguards the Personal Data Protection Law requires for such transfers.",
        ],
      },
      {
        heading: "Retention and your rights",
        paragraphs: [
          "Order files are kept for the retention period stated in your workspace and then deleted. Financial records are kept as long as the law requires. You may request access, correction or deletion of your data from your settings page or by contacting us.",
        ],
      },
    ],
    ar: [
      {
        heading: "ما نجمعه",
        paragraphs: [
          "بيانات الحساب (الاسم والبريد الإلكتروني ورقم الجوال الاختياري)، وتفاصيل الطلبات والملفات التي ترفعها، والرسائل، وسجلات الدفع التي يرسلها مزوّد الدفع (دون رقم بطاقتك كاملاً أبداً)، والسجلات التقنية اللازمة للأمان.",
        ],
      },
      {
        heading: "لماذا نستخدمها",
        paragraphs: [
          "لتقديم الخدمة التي طلبتها، والتواصل معك، والوفاء بالالتزامات المحاسبية والنظامية، وحماية المنصة من إساءة الاستخدام. لا نرسل رسائل تسويقية إلا بموافقتك.",
        ],
      },
      {
        heading: "من يعالجها",
        paragraphs: [
          "مزوّد الاستضافة وقاعدة البيانات والتخزين، ومزوّد البريد الإلكتروني، ومزوّد الدفع، وعند موافقتك فقط مزوّد ذكاء اصطناعي يتلقى ملخصاً نصياً مختصراً لطلبك دون ملفات أو بيانات تواصل. قد يعالج بعض هؤلاء البيانات خارج المملكة، ونعتمد في ذلك على الضمانات التي يتطلبها نظام حماية البيانات الشخصية.",
        ],
      },
      {
        heading: "الاحتفاظ وحقوقك",
        paragraphs: [
          "تُحفظ ملفات الطلب طوال مدة الاحتفاظ الموضحة في مساحة عملك ثم تُحذف، وتُحفظ السجلات المالية للمدة التي يتطلبها النظام. يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها من صفحة الإعدادات أو بالتواصل معنا.",
        ],
      },
    ],
  },
  integrity: {
    en: [
      {
        heading: "Our commitment",
        paragraphs: [
          "We help you learn, research and communicate better. We do not produce assessed work — assignments, exams, theses or dissertations — for submission under your name or anyone else's.",
          "Educational exemplars are annotated models for study. They are marked as such and must not be submitted for credit.",
        ],
      },
      {
        heading: "What we will decline",
        paragraphs: [
          "Requests to complete graded work, to impersonate a student in an assessment, to fabricate data or sources, or to disguise authorship. We may cancel an order, with a refund under the refund policy, if we learn that its intended use breaches this policy.",
        ],
      },
      {
        heading: "Authorship",
        paragraphs: [
          "When you use our editing, analysis or translation support in your own work, follow your institution's rules on acknowledging assistance. We can provide a statement describing the support we gave.",
        ],
      },
    ],
    ar: [
      {
        heading: "التزامنا",
        paragraphs: [
          "نساعدك على التعلم والبحث والتعبير بشكل أفضل، ولا ننتج أعمالاً تقييمية — واجبات أو اختبارات أو رسائل علمية — لتُسلَّم باسمك أو باسم غيرك.",
          "النماذج التعليمية نماذج مشروحة للدراسة، تُوسم بذلك، ولا يجوز تسليمها للحصول على درجات.",
        ],
      },
      {
        heading: "ما نعتذر عنه",
        paragraphs: [
          "طلبات إنجاز أعمال تُقيَّم بدرجات، أو انتحال شخصية طالب في اختبار، أو اختلاق بيانات أو مصادر، أو إخفاء حقيقة التأليف. وقد نلغي الطلب، مع الاسترداد وفق سياسة الاسترداد، إذا تبيّن لنا أن استخدامه المقصود يخالف هذه السياسة.",
        ],
      },
      {
        heading: "حق التأليف",
        paragraphs: [
          "عند استخدام دعمنا في التحرير أو التحليل أو الترجمة في عملك، اتبع أنظمة مؤسستك في الإفصاح عن المساعدة. ويمكننا تزويدك ببيان يصف الدعم الذي قدمناه.",
        ],
      },
    ],
  },
  "acceptable-use": {
    en: [
      {
        heading: "Permitted use",
        paragraphs: [
          "Personal learning and study, support for your own research, professional and business work, and preparing your own manuscripts for publication.",
        ],
      },
      {
        heading: "Prohibited use",
        paragraphs: [
          "Submitting our work for assessment as your own; uploading material you have no right to share; content that is unlawful, defamatory or infringes others' rights; attempts to access other customers' data or to disrupt the service; and automated scraping or abuse of the platform.",
        ],
      },
      {
        heading: "Confirmation",
        paragraphs: ["Before each order you confirm that your intended use complies with this policy. That confirmation is recorded with the order."],
      },
    ],
    ar: [
      {
        heading: "الاستخدام المسموح",
        paragraphs: ["التعلم والدراسة الشخصية، ودعم بحثك الخاص، والأعمال المهنية والتجارية، وتجهيز مخطوطاتك الخاصة للنشر."],
      },
      {
        heading: "الاستخدام المحظور",
        paragraphs: [
          "تسليم أعمالنا للتقييم على أنها عملك، ورفع مواد لا يحق لك مشاركتها، والمحتوى المخالف للأنظمة أو المسيء أو المنتهك لحقوق الآخرين، ومحاولات الوصول إلى بيانات العملاء الآخرين أو تعطيل الخدمة، والاستخلاص الآلي للبيانات أو إساءة استخدام المنصة.",
        ],
      },
      {
        heading: "التأكيد",
        paragraphs: ["تؤكد قبل كل طلب أن استخدامك المقصود يتوافق مع هذه السياسة، ويُسجَّل هذا التأكيد مع الطلب."],
      },
    ],
  },
  revisions: {
    en: [
      {
        heading: "Included revisions",
        paragraphs: [
          "Each service includes the number of revisions shown in your order. A revision addresses changes within the original scope and instructions, requested within the revision window after delivery.",
        ],
      },
      {
        heading: "Additional scope",
        paragraphs: [
          "Changes that go beyond the original instructions, or requests beyond the included revisions, are quoted separately. Work on them starts only after you accept and pay that quote.",
        ],
      },
      {
        heading: "Versions",
        paragraphs: ["Every delivery is kept as a numbered version, so previous versions remain available for the retention period."],
      },
    ],
    ar: [
      {
        heading: "التعديلات المشمولة",
        paragraphs: [
          "تشمل كل خدمة عدد التعديلات الموضح في طلبك. يعالج التعديل التغييرات ضمن النطاق والتعليمات الأصلية، ويُطلب خلال فترة التعديل بعد التسليم.",
        ],
      },
      {
        heading: "النطاق الإضافي",
        paragraphs: [
          "التغييرات التي تتجاوز التعليمات الأصلية، أو الطلبات التي تتجاوز التعديلات المشمولة، تُسعَّر منفصلاً، ولا يبدأ العمل عليها إلا بعد قبولك عرض السعر وسداده.",
        ],
      },
      {
        heading: "الإصدارات",
        paragraphs: ["يُحفظ كل تسليم بإصدار مرقّم، فتبقى الإصدارات السابقة متاحة طوال مدة الاحتفاظ."],
      },
    ],
  },
  refunds: {
    en: [
      {
        heading: "Cancelling before payment",
        paragraphs: ["You can cancel a draft, a submitted order or a quoted order at any time before payment at no cost."],
      },
      {
        heading: "Refunds after payment",
        paragraphs: [
          "If you cancel after payment but before work starts, you receive a full refund. Once work has started, a partial refund reflects the work completed. If we cannot deliver what was quoted, you receive a full refund.",
          "Refunds are approved by the owner and returned to the original payment method through our payment provider; they are never paid by bank transfer. Your bank may take several business days to show the credit.",
        ],
      },
      {
        heading: "How to request",
        paragraphs: ["Message us from your order workspace. We respond within two business days."],
      },
    ],
    ar: [
      {
        heading: "الإلغاء قبل الدفع",
        paragraphs: ["يمكنك إلغاء المسودة أو الطلب المرسل أو الطلب الذي وصله عرض سعر في أي وقت قبل الدفع دون أي تكلفة."],
      },
      {
        heading: "الاسترداد بعد الدفع",
        paragraphs: [
          "إذا ألغيت بعد الدفع وقبل بدء العمل فستسترد المبلغ كاملاً. وبعد بدء العمل يعكس الاسترداد الجزئي ما أُنجز من عمل. وإذا تعذّر علينا تسليم ما ورد في عرض السعر فستسترد المبلغ كاملاً.",
          "يعتمد المالك الاسترداد، ويُعاد المبلغ إلى وسيلة الدفع الأصلية عبر مزوّد الدفع، ولا يُدفع أبداً بتحويل بنكي. قد يستغرق ظهور المبلغ في حسابك عدة أيام عمل.",
        ],
      },
      {
        heading: "طريقة الطلب",
        paragraphs: ["راسلنا من مساحة عمل الطلب، وسنرد خلال يومَي عمل."],
      },
    ],
  },
};
