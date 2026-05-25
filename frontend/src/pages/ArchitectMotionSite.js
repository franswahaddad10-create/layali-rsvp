import React, { useEffect, useState } from 'react';
import './ArchitectMotionSite.css';

const sections = [
  {
    id: 'facade',
    title: 'מעטפת חיה',
    text: 'תכנון מעטפת שמתנהגת כמו סצנה: עומק, אור, וקצב תנועה שמרגיש טבעי לעין.',
  },
  {
    id: 'motion',
    title: 'שפה תנועתית',
    text: 'כל אלמנט מגיב לגלילה באופן מחושב כדי לספר סיפור של בניין בתנועה.',
  },
  {
    id: 'identity',
    title: 'זהות מותגית',
    text: 'תרגום סגנון אישי של היוצר לחוויה דיגיטלית עם חתימה ויזואלית ברורה.',
  },
];

function ArchitectMotionSite() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsLoaded(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      {
        root: null,
        threshold: 0.25,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    const elements = document.querySelectorAll('.reveal-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`arch-site ${isLoaded ? 'site-loaded' : ''}`} dir="rtl">
      <div className="backdrop-grid" aria-hidden="true" />
      <div className="backdrop-glow" aria-hidden="true" />

      <header className="hero reveal-on-scroll">
        <p className="eyebrow">Architecture in Motion</p>
        <h1>אנימציה אדריכלית שמכניסה חיים לבניין</h1>
        <p className="lead">
          זהו בסיס ראשוני לאתר החדש. אחרי שתשלח תמונות וסימונים, נתאים את הצבעים,
          הטיפוגרפיה, הקצב והתנועה בדיוק לסגנון האישי.
        </p>
        <a className="hero-cta" href="#work">לגלול לעומק</a>
      </header>

      <main>
        <section id="work" className="section-grid">
          {sections.map((item, index) => (
            <article
              className="motion-card reveal-on-scroll"
              style={{ '--stagger': `${index * 120}ms` }}
              key={item.id}
            >
              <span className="card-index">0{index + 1}</span>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </article>
          ))}
        </section>

        <section className="visual-band reveal-on-scroll" aria-label="visual placeholder">
          <div className="building-silhouette" />
          <div className="scan-line" />
          <p>אזור זה יתמלא באלמנטים שתסמן מהתמונות שתשלח.</p>
        </section>
      </main>
    </div>
  );
}

export default ArchitectMotionSite;
