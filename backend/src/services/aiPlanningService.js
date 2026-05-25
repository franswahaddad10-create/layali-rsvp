const MAX_RECENT_MESSAGES = 8;

const createPlanningMessageId = (role = 'msg') => `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const containsArabic = (text = '') => /[\u0600-\u06FF]/.test(text);
const containsHebrew = (text = '') => /[\u0590-\u05FF]/.test(text);

const detectLanguage = (text = '', fallback = 'he') => {
  if (containsArabic(text)) {
    return 'ar';
  }

  if (containsHebrew(text)) {
    return 'he';
  }

  return fallback || 'en';
};

const toSearchableValue = (value = '') => String(value).trim().toLowerCase();

const findGuestMatches = (text = '', guests = []) => {
  const query = toSearchableValue(text);
  if (!query) {
    return [];
  }

  return guests
    .filter((guest) => {
      const fullName = [guest.name, guest.surname].filter(Boolean).join(' ').trim().toLowerCase();
      return fullName && query.includes(fullName);
    })
    .slice(0, 5)
    .map((guest) => ({
      guestId: String(guest._id),
      name: [guest.name, guest.surname].filter(Boolean).join(' ').trim(),
    }));
};

const buildIntentMap = (language) => {
  if (language === 'ar') {
    return {
      together: ['مع بعض', 'سوا', 'جنب بعض', 'نفس الطاولة'],
      apart: ['بعيد', 'ابعد', 'لا تقعدهم مع بعض', 'فصل'],
      vip: ['vip', 'مهم', 'مميز', 'الشخصيات المهمة'],
      entrance: ['المدخل', 'قريب على المدخل', 'عند الباب'],
      stage: ['المنصة', 'المسرح', 'قدام'],
      accessibility: ['كبار', 'كرسي', 'وصول', 'مدخل سهل', 'احتياجات خاصة'],
      family: ['عائلة', 'اهل', 'الأسرة'],
      friends: ['اصحاب', 'أصدقاء'],
    };
  }

  if (language === 'en') {
    return {
      together: ['together', 'same table', 'sit together', 'near each other'],
      apart: ['separate', 'keep apart', 'far from', 'not together'],
      vip: ['vip', 'important', 'special guests'],
      entrance: ['entrance', 'near entrance', 'door'],
      stage: ['stage', 'front', 'near stage'],
      accessibility: ['accessible', 'elderly', 'easy access', 'special needs'],
      family: ['family', 'relatives'],
      friends: ['friends'],
    };
  }

  return {
    together: ['ביחד', 'לשבת יחד', 'אותו שולחן', 'ליד אחד השני'],
    apart: ['להרחיק', 'בנפרד', 'לא ביחד', 'לא ליד'],
    vip: ['vip', 'חשובים', 'אורחים חשובים', 'מכובדים'],
    entrance: ['כניסה', 'קרוב לכניסה', 'ליד הדלת'],
    stage: ['במה', 'קרוב לבמה', 'קדימה'],
    accessibility: ['נגישות', 'מבוגרים', 'כיסא גלגלים', 'גישה נוחה', 'צרכים מיוחדים'],
    family: ['משפחה', 'קרובי משפחה'],
    friends: ['חברים'],
  };
};

const extractPlanningSignals = (text = '', language = 'he') => {
  const query = toSearchableValue(text);
  const intents = [];
  const map = buildIntentMap(language);

  Object.entries(map).forEach(([intent, keywords]) => {
    if (keywords.some((keyword) => query.includes(toSearchableValue(keyword)))) {
      intents.push(intent);
    }
  });

  return Array.from(new Set(intents));
};

const buildLocalizedReply = ({ language, event, guests = [], signals = [], guestMatches = [], recentMessages = [] }) => {
  const tableCount = (event.hallLayout || []).length;
  const groupCount = (event.groups || []).length;

  if (language === 'ar') {
    const summaryParts = [];
    if (signals.includes('together')) summaryParts.push('فهمت أن هناك طلبات لجلوس أشخاص أو مجموعات مع بعض.');
    if (signals.includes('apart')) summaryParts.push('وفهمت أيضاً أن هناك مجموعات يجب إبعادها عن بعضها.');
    if (signals.includes('vip')) summaryParts.push('سأتعامل مع الضيوف المهمين كأولوية في الاقتراحات.');
    if (signals.includes('entrance')) summaryParts.push('سأضع أولوية للطاولات القريبة من المدخل.');
    if (signals.includes('stage')) summaryParts.push('سأأخذ بعين الاعتبار القرب من المنصة.');
    if (signals.includes('accessibility')) summaryParts.push('سأضيف احتياجات الوصول السهل والضيوف الكبار للقيود.');

    const matchedLine = guestMatches.length
      ? `تعرفت حالياً على: ${guestMatches.map((match) => match.name).join('، ')}.`
      : 'إذا ذكرت أسماء كما هي موجودة في القائمة سأحاول ربطها تلقائياً بالمدعوين.';

    return {
      text: [
        summaryParts.length ? summaryParts.join(' ') : 'أنا جاهز لمساعدتك في تخطيط الجلسات وتقسيم المجموعات.',
        `حالياً يوجد ${guests.length} ضيف، ${groupCount} مجموعات، و ${tableCount} طاولات في الخريطة.`,
        matchedLine,
        'أرسل لي الآن من يجب أن يجلس مع من، ومن يجب إبعاده، وأي ضيوف كبار أو VIP أو قريبين من المدخل.',
      ].join(' '),
      suggestions: summaryParts,
    };
  }

  if (language === 'en') {
    const summaryParts = [];
    if (signals.includes('together')) summaryParts.push('I detected requests to keep people or groups together.');
    if (signals.includes('apart')) summaryParts.push('I also detected separation requests.');
    if (signals.includes('vip')) summaryParts.push('I will prioritize VIP placement.');
    if (signals.includes('entrance')) summaryParts.push('I will prefer tables near the entrance.');
    if (signals.includes('stage')) summaryParts.push('I will take stage proximity into account.');
    if (signals.includes('accessibility')) summaryParts.push('I will include accessibility and elderly guest needs.');

    const matchedLine = guestMatches.length
      ? `I currently matched these guests: ${guestMatches.map((match) => match.name).join(', ')}.`
      : 'If you mention guest names as they appear in the list, I will try to match them automatically.';

    return {
      text: [
        summaryParts.length ? summaryParts.join(' ') : 'I am ready to help you plan groups and seating.',
        `The event currently has ${guests.length} guests, ${groupCount} groups, and ${tableCount} tables in the hall layout.`,
        matchedLine,
        'Tell me who should sit together, who should stay apart, and which guests need VIP or easy-access seating.',
      ].join(' '),
      suggestions: summaryParts,
    };
  }

  const summaryParts = [];
  if (signals.includes('together')) summaryParts.push('זיהיתי בקשה להושיב אנשים או קבוצות יחד.');
  if (signals.includes('apart')) summaryParts.push('זיהיתי גם בקשה להרחיק בין קבוצות או אורחים.');
  if (signals.includes('vip')) summaryParts.push('אתן עדיפות לאורחי VIP בהצעות הישיבה.');
  if (signals.includes('entrance')) summaryParts.push('אעדיף שולחנות קרובים לכניסה.');
  if (signals.includes('stage')) summaryParts.push('אקח בחשבון קרבה לבמה.');
  if (signals.includes('accessibility')) summaryParts.push('אוסיף גם אילוצי נגישות ואורחים מבוגרים.');

  const matchedLine = guestMatches.length
    ? `כרגע זיהיתי את האורחים: ${guestMatches.map((match) => match.name).join(', ')}.`
    : 'אם תכתוב שמות כפי שהם מופיעים ברשימה, אנסה להתאים אותם אוטומטית למוזמנים.';

  const recentContext = recentMessages.length > 1 ? 'אני גם שומר את ההקשר של השיחה כדי להמשיך את התכנון בהודעות הבאות.' : '';

  return {
    text: [
      summaryParts.length ? summaryParts.join(' ') : 'אני מוכן לעזור לך לתכנן קבוצות והושבה לאירוע.',
      `כרגע יש באירוע ${guests.length} אורחים, ${groupCount} קבוצות ו-${tableCount} שולחנות במפת האולם.`,
      matchedLine,
      recentContext,
      'כתוב לי עכשיו מי צריך לשבת יחד, מי צריך להיות רחוק, ומי דורש שולחן VIP או גישה נוחה.',
    ].join(' '),
    suggestions: summaryParts,
  };
};

const buildPlanningAssistantReply = ({ text, preferredLanguage, event, guests }) => {
  const language = detectLanguage(text, preferredLanguage);
  const signals = extractPlanningSignals(text, language);
  const guestMatches = findGuestMatches(text, guests);
  const recentMessages = (event.planningConversation || []).slice(0, MAX_RECENT_MESSAGES);
  const reply = buildLocalizedReply({ language, event, guests, signals, guestMatches, recentMessages });

  return {
    language,
    text: reply.text,
    metadata: {
      signals,
      guestMatches,
      suggestions: reply.suggestions || [],
    },
  };
};

module.exports = {
  buildPlanningAssistantReply,
  createPlanningMessageId,
  detectLanguage,
};