import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDollarSign,
  FileText,
  Image as ImageIcon,
  Link2,
  Mail,
  Mic,
  Plus,
  Search,
  Settings,
  Trash2,
  Video,
} from "lucide-react";
import { WaitlistForm } from "./waitlist-form";
import styles from "./landing.module.css";

function DotLogo() {
  return (
    <span className={styles.wordmark} aria-label="Dot">
      <span className={styles.logoDot} aria-hidden="true" />
      <span>Dot</span>
    </span>
  );
}

function PhoneChrome({ group = false }: { group?: boolean }) {
  return (
    <>
      <div className={styles.statusBar}>
        <span>9:41</span>
        <span className={styles.dynamicIsland} aria-hidden="true" />
        <span className={styles.phoneStatus}>●●● ᯤ ▰</span>
      </div>
      <div className={styles.imessageHeader}>
        <span className={`${styles.backButton} ${styles.glassControl}`}>
          <ChevronLeft size={25} strokeWidth={2.4} />{group ? <small>4</small> : null}
        </span>
        <div className={styles.contactBlock}>
          {group ? (
            <div className={styles.groupFaces} aria-hidden="true"><i /><i /><i /></div>
          ) : (
            <span className={styles.contactDot} aria-hidden="true" />
          )}
          <span className={styles.contactName}>{group ? "montreal?" : "Dot"} ›</span>
        </div>
        <span className={`${styles.videoButton} ${styles.glassControl}`}>
          <Video size={22} strokeWidth={1.9} />
        </span>
      </div>
    </>
  );
}

function Composer() {
  return (
    <div className={styles.composer}>
      <span className={styles.composerPlus}><Plus size={21} strokeWidth={2} /></span>
      <span className={styles.composerField}>iMessage <Mic size={17} strokeWidth={1.8} /></span>
    </div>
  );
}

function DirectMessageProof() {
  return (
    <div className={styles.productCanvas} aria-label="A one-to-one iMessage conversation with Dot">
      <div className={styles.canvasLabel}>One conversation</div>

      <div className={`${styles.signalCard} ${styles.signalLeft}`}>
        <span className={styles.signalIcon}><ImageIcon size={16} /></span>
        <div><strong>Image understood</strong><span>flight confirmation</span></div>
      </div>
      <div className={`${styles.signalCard} ${styles.signalRight}`}>
        <span className={styles.signalIcon}><CalendarDays size={16} /></span>
        <div><strong>Calendar checked</strong><span>no conflicts found</span></div>
      </div>
      <div className={`${styles.signalCard} ${styles.signalBottom}`}>
        <span className={styles.signalIcon}><Link2 size={16} /></span>
        <div><strong>Little app made</strong><span>trip plan · 8 items</span></div>
      </div>

      <div className={`${styles.phone} ${styles.lakePhone}`}>
        <PhoneChrome />
        <div className={styles.messageThread}>
          <span className={styles.timestamp}>Today 9:41 AM</span>
          <div className={`${styles.messageRow} ${styles.messageRowUser}`}>
            <div className={styles.photoMessage}>
              <div className={styles.photoSky}><span>✦</span></div>
              <div className={styles.flightCard}>
                <span>FLIGHT CONFIRMATION</span>
                <strong>CAI <i>→</i> YUL</strong>
                <small>SEP 18 · 10:25 PM</small>
              </div>
            </div>
          </div>
          <div className={`${styles.messageBubble} ${styles.userBubble}`}>
            can you turn this into a plan and check if i’m free?
          </div>
          <span className={styles.delivery}>Delivered</span>
          <div className={`${styles.messageBubble} ${styles.dotBubble} ${styles.messageDelayOne}`}>
            yeah, give me a sec
          </div>
          <div className={`${styles.messageBubble} ${styles.dotBubble} ${styles.messageDelayTwo}`}>
            you’re free. put the flight in your trip plan, made a packing list, and set a reminder for check-in
          </div>
          <div className={`${styles.linkPreview} ${styles.messageDelayThree}`}>
            <div className={styles.linkPreviewArt}><span>CAI</span><i /><span>YUL</span></div>
            <div><strong>montréal trip</strong><span>plan · packing · expenses</span></div>
          </div>
        </div>
        <Composer />
      </div>
    </div>
  );
}

function AnswerVisual() {
  return (
    <div className={styles.featureVisual}>
      <div className={styles.queryBubble}>what’s actually worth doing in montreal this weekend?</div>
      <div className={styles.answerBubble}>skip the generic list. these are the three i’d actually pick based on where you’re staying</div>
      <div className={styles.resultStrip}><Search size={14} /><span>checked current sources</span><span>just now</span></div>
    </div>
  );
}

function ActVisual() {
  return (
    <div className={styles.featureVisual}>
      <div className={styles.connectionRow}><CalendarDays size={17} /><span>Calendar</span><strong>connected</strong></div>
      <div className={styles.connectionRow}><Mail size={17} /><span>Gmail</span><strong>2 accounts</strong></div>
      <div className={styles.connectionRow}><CircleDollarSign size={17} /><span>Banking</span><strong>connected</strong></div>
      <div className={styles.actionConfirmation}><Check size={15} /><span>check-in reminder set for sep 17</span></div>
    </div>
  );
}

function MakeVisual() {
  return (
    <div className={styles.featureVisual}>
      <div className={styles.appCard}>
        <div className={styles.appCardTop}><span>spending</span><span>made by dot</span></div>
        <strong>$1,284</strong>
        <span className={styles.appSubtitle}>this month · $216 under pace</span>
        <div className={styles.appBars}><i /><i /><i /><i /><i /><i /><i /></div>
        <button type="button">open tracker <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

function MediaVisual() {
  return (
    <div className={styles.mediaCanvas} aria-label="Examples of media Dot can understand">
      <div className={`${styles.mediaTile} ${styles.mediaPhoto}`}>
        <div className={styles.receiptTop}><span>CAFÉ NERO</span><span>12:48</span></div>
        <strong>$18.40</strong>
        <span>receipt photo</span>
      </div>
      <div className={`${styles.mediaTile} ${styles.mediaScreenshot}`}>
        <div className={styles.eventDate}><strong>18</strong><span>SEP</span></div>
        <div><strong>Flight to Montréal</strong><span>screenshot</span></div>
      </div>
      <div className={`${styles.mediaTile} ${styles.mediaFile}`}>
        <FileText size={21} />
        <div><strong>weekend-ideas.pdf</strong><span>file · 8 pages</span></div>
      </div>
      <div className={styles.mediaReply}>
        <span className={styles.contactDot} />
        <p>got it. i pulled out the dates, total, and the two things you need to do next</p>
      </div>
    </div>
  );
}

function ControlVisual() {
  return (
    <div className={styles.controlCanvas} aria-label="Managing Dot through iMessage">
      <div className={`${styles.compactPhone} ${styles.paperPhone}`}>
        <PhoneChrome />
        <div className={styles.controlThread}>
          <div className={`${styles.messageBubble} ${styles.userBubble}`}>
            delete my old birthday planner and disconnect my work calendar
          </div>
          <div className={`${styles.messageBubble} ${styles.dotBubble}`}>
            found both. want me to delete the app and disconnect work@gmail.com?
          </div>
          <div className={`${styles.messageBubble} ${styles.userBubble}`}>yep</div>
          <div className={`${styles.messageBubble} ${styles.dotBubble}`}>done</div>
        </div>
        <Composer />
      </div>
      <div className={styles.controlList}>
        <div><Trash2 size={16} /><span>Apps</span><strong>manage or delete</strong></div>
        <div><Link2 size={16} /><span>Connections</span><strong>connect or remove</strong></div>
        <div><Settings size={16} /><span>Settings</span><strong>change by text</strong></div>
        <div><Check size={16} /><span>Your account</span><strong>full control</strong></div>
      </div>
    </div>
  );
}

function GroupVisual() {
  return (
    <div className={styles.groupCanvas} aria-label="Dot in an iMessage group conversation">
      <div className={`${styles.groupPhone} ${styles.mountainPhone}`}>
        <PhoneChrome group />
        <div className={styles.groupThread}>
          <span className={styles.speaker}>Maya</span>
          <div className={`${styles.messageBubble} ${styles.groupHumanBubble}`}>we are never figuring out what everyone owes</div>
          <div className={`${styles.messageBubble} ${styles.userBubble}`}>dot save us</div>
          <span className={styles.speaker}>Dot</span>
          <div className={`${styles.messageBubble} ${styles.dotBubble}`}>lmao on it</div>
          <div className={styles.groupAppLink}><strong>montreal split</strong><span>4 people · CAD · shared</span></div>
        </div>
        <Composer />
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <main className={styles.landing}>
      <nav className={styles.nav} aria-label="Main navigation">
        <a href="#top"><DotLogo /></a>
        <div className={styles.navLinks}>
          <a href="#what-dot-does">What Dot does</a>
          <a href="#send-anything">Send anything</a>
          <a href="#groups">Groups</a>
        </div>
        <a href="#waitlist" className={styles.navButton}>Join the beta <ArrowRight size={14} /></a>
      </nav>

      <section className={styles.hero} id="top">
        <div className={styles.heroContent}>
          <span className={styles.betaTag}>Private iMessage beta · opening soon</span>
          <div className={styles.heroMark} aria-hidden="true">
            <span className={styles.heroMarkDot} />
          </div>
          <div className={styles.heroBottom}>
            <h1>
              Your life, one conversation.
              <span>Ask it. Hand it off. Make what you need.</span>
            </h1>
            <p>
              Dot lives in iMessage. It can search, plan, connect to your calendar, email, and bank,
              or make a little app around whatever you need.
            </p>
            <div className={styles.heroActions} id="waitlist">
              <WaitlistForm />
            </div>
            <span className={styles.waitlistNote}>Join with email. We’ll send your iMessage invite when it’s your turn.</span>
          </div>
        </div>
        <DirectMessageProof />
      </section>

      <section className={styles.section} id="what-dot-does">
        <header className={styles.sectionHeader}>
          <span>What Dot does</span>
          <h2>One message can become an answer, an action, or something made for you.</h2>
        </header>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard}>
            <div className={styles.featureCopy}><span>Answer</span><h3>Ask it like a friend who actually looks things up.</h3><p>Current information, useful judgment, and follow-ups that remember the point.</p></div>
            <AnswerVisual />
          </article>
          <article className={styles.featureCard}>
            <div className={styles.featureCopy}><span>Act</span><h3>Connect what you want. Dot handles the useful part.</h3><p>Calendar, email, and money stay available when a conversation turns into a task.</p></div>
            <ActVisual />
          </article>
          <article className={styles.featureCard}>
            <div className={styles.featureCopy}><span>Make</span><h3>When chat isn’t enough, Dot makes the little app you need.</h3><p>Trackers, planners, lists, budgets, and tools made around the actual situation.</p></div>
            <MakeVisual />
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.splitSection}`} id="send-anything">
        <div className={styles.splitCopy}>
          <span className={styles.sectionEyebrow}>More than text</span>
          <h2>Show Dot what you mean.</h2>
          <p>Send a photo, screenshot, receipt, or file the same way you’d send it to a friend. Dot can understand it, connect it to the conversation, and do something useful with it.</p>
          <ul>
            <li><Check size={15} /> pull details from screenshots</li>
            <li><Check size={15} /> understand photos and receipts</li>
            <li><Check size={15} /> keep the result in the same conversation</li>
          </ul>
        </div>
        <MediaVisual />
      </section>

      <section className={`${styles.section} ${styles.controlSection}`}>
        <header className={styles.sectionHeader}>
          <span>Everything by text</span>
          <h2>No dashboard scavenger hunt.</h2>
          <p>Manage the apps Dot makes, connect or remove integrations, change settings, and control your account without leaving iMessage. Destructive actions always ask first.</p>
        </header>
        <ControlVisual />
      </section>

      <section className={`${styles.section} ${styles.groupSection}`} id="groups">
        <div className={styles.splitCopy}>
          <span className={styles.sectionEyebrow}>Also works in groups</span>
          <h2>Bring Dot in when the group needs help.</h2>
          <p>Plan the trip, settle expenses, make a shared tool, or answer the thing nobody wants to research. Dot joins the conversation without trying to become the conversation.</p>
        </div>
        <GroupVisual />
      </section>

      <footer className={styles.artFooter}>
        <div className={styles.footerTop}>
          <DotLogo />
          <a href="#top">Back to top ↑</a>
        </div>
        <div className={styles.footerCta}>
          <span>Private beta · opening soon</span>
          <h2>Get Dot in your messages.</h2>
          <p>Join the waitlist. Bring a friend when you’re in, and you both move up.</p>
          <div className={styles.finalForm}><WaitlistForm compact /></div>
        </div>
        <div className={styles.footerWord} aria-hidden="true">DOT</div>
        <div className={styles.footerRail}>
          <span>A capable friend, one text away.</span>
          <span>© 2026 Dot</span>
          <span>iMessage is a trademark of Apple Inc.</span>
        </div>
      </footer>
    </main>
  );
}
