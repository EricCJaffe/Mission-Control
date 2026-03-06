import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | TacPastor’s Mission Control',
}

type PolicySubsection = {
  subtitle: string
  content?: string
  list?: string[]
}

type PolicySection = {
  title: string
  content?: string
  list?: string[]
  subsections?: PolicySubsection[]
  afterList?: string
}

const sections: PolicySection[] = [
  {
    title: '1. Introduction',
    content:
      'Foundation Stone Advisors ("we," "our," or "us") values your privacy and is committed to protecting your personal information. This Privacy Policy explains what information we collect, how we use it, how we share it, and the choices you have regarding your information.\n\nBy accessing or using our website, products, or services (collectively, the "Services"), you agree to the practices described in this Privacy Policy.',
  },
  {
    title: '2. Information We Collect',
    content: 'We may collect the following categories of information, depending on how you use our Services:',
    subsections: [
      {
        subtitle: 'A. Information You Provide',
        list: [
          'Name, email address, and other contact details',
          'Account information (if you create an account)',
          'Information you submit through forms, surveys, or messages',
          'Communications with us (e.g., customer support requests)',
        ],
      },
      {
        subtitle: 'B. Information Collected Automatically',
        list: [
          'Device and browser information (e.g., device type, operating system, browser type)',
          'IP address and approximate location derived from IP',
          'Log and usage data (e.g., pages viewed, links clicked, time spent, referring/exit pages, timestamps)',
          'Cookies and similar technologies (see Section 10)',
        ],
      },
      {
        subtitle: 'C. Information From Connected Services and Integrations (Optional)',
        content:
          'If you choose to connect third-party services or integrations, we may access and process information you authorize that third party to share with us (which may include account identifiers, authentication tokens, and data made available by the integration). You control what is shared through the authorization flow and your third-party provider settings.',
      },
      {
        subtitle: 'D. Health, Biometric, or Fitness-Related Data (Optional)',
        content:
          'Depending on the features you use and any integrations you enable, the Services may process health, biometric, or fitness-related data you provide or authorize access to (for example: activity metrics, workout data, heart rate-related metrics, sleep-related metrics, or similar wellness data).',
        list: [
          'We process this data only to provide and improve the Services and features you request.',
          'We do not use health/biometric/fitness-related data to make decisions that produce legal or similarly significant effects about you.',
          'Unless you explicitly request otherwise, we do not treat this data as "public" or share it broadly.',
        ],
      },
    ],
    afterList:
      'We collect only the information reasonably necessary to operate, maintain, and improve the Services.',
  },
  {
    title: '3. How We Use Information',
    content: 'We use information we collect to:',
    list: [
      'Provide, operate, and maintain the Services',
      'Create and manage accounts and authentication',
      'Deliver features and functionality you request',
      'Display or analyze data you choose to provide or connect through integrations',
      'Improve performance, reliability, and user experience',
      'Communicate with you (including responding to support requests)',
      'Monitor, prevent, and address security issues, fraud, and abuse',
      'Comply with legal obligations and enforce our terms and policies',
    ],
  },
  {
    title: '4. Analytics, Advertising, and Tracking Technologies',
    content: 'We may use third-party analytics tools and tracking technologies (such as cookies, pixels, and similar technologies) to:',
    list: [
      'Understand how users interact with our website and Services',
      'Measure and improve marketing effectiveness',
      'Deliver advertisements or content that may be more relevant to you',
      'Build audiences for advertising campaigns and measure conversions',
    ],
    afterList:
      'These tools may collect information such as your IP address, device identifiers, browser information, pages visited, and actions taken. Some of these tools may be provided by platforms such as analytics providers and social media/advertising networks.\n\nYour choices: You can limit or disable cookies through your browser settings, and some third-party providers may offer additional opt-out mechanisms. Disabling cookies may impact certain site functionality.',
  },
  {
    title: '5. How We Share Information',
    content: 'We do not sell your personal information.\n\nWe may share information only in these circumstances:',
    subsections: [
      {
        subtitle: 'A. Service Providers',
        content:
          'We may share information with trusted vendors that help us operate the Services (e.g., hosting, analytics, customer support tools, security services). These providers are authorized to use information only as needed to provide services to us and are subject to confidentiality and security obligations.',
      },
      {
        subtitle: 'B. Legal and Safety',
        content:
          'We may disclose information if required by law, legal process, or governmental request, or to protect the rights, property, and safety of our users, our business, or others.',
      },
      {
        subtitle: 'C. Business Transfers',
        content:
          'If we are involved in a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets, information may be transferred as part of that transaction, subject to reasonable protections.',
      },
    ],
  },
  {
    title: '6. Data Retention',
    content: 'We retain personal information only as long as necessary to:',
    list: [
      'Provide the Services',
      'Comply with legal obligations',
      'Resolve disputes',
      'Enforce our agreements',
      'Maintain security and prevent fraud/abuse',
    ],
    afterList: 'Retention periods may vary depending on the type of data and how it is used.',
  },
  {
    title: '7. Security',
    content:
      'We use reasonable administrative, technical, and organizational safeguards designed to protect information against unauthorized access, loss, misuse, alteration, or destruction. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.',
  },
  {
    title: '8. Your Rights and Choices',
    content: 'Depending on your location, you may have rights regarding your personal information, including:',
    list: [
      'Accessing, correcting, or updating your information',
      'Requesting deletion of your account and associated data',
      'Objecting to or restricting certain processing',
      'Withdrawing consent where processing is based on consent',
    ],
    afterList:
      'To exercise these rights, contact us at admin@foundationstoneadvisors.com. We may need to verify your identity before fulfilling certain requests. We may retain certain information where required by law or for legitimate business purposes (e.g., compliance, security, fraud prevention).',
  },
  {
    title: '9. Integrations and Authorization Control',
    content:
      'If you connect third-party services, you can typically revoke access at any time through your third-party account settings or within the integration settings provided in our Services (if available). After revocation, we will stop collecting new data from that integration, though we may retain previously collected data as described in this Policy unless you request deletion.',
  },
  {
    title: '10. Cookies and Similar Technologies',
    content:
      'We use cookies, pixels, local storage, and similar technologies to operate the Services, remember preferences, enable features, and analyze usage. You can control cookies through your browser settings and may be able to clear stored cookies at any time. If you disable cookies, some features may not function properly.',
  },
  {
    title: '11. Third-Party Links and Services',
    content:
      'The Services may contain links to third-party websites or services. Their privacy practices are governed by their own policies, and we are not responsible for third-party privacy practices.',
  },
  {
    title: "12. Children's Privacy",
    content:
      'Our Services are not directed to children under 13 (or the applicable minimum age in your jurisdiction), and we do not knowingly collect personal information from children. If you believe a child has provided personal information, please contact us so we can delete it.',
  },
  {
    title: '13. Changes to This Policy',
    content:
      'We may update this Privacy Policy from time to time. We will post updates on this page and revise the effective date above. Your continued use of the Services after an update means you accept the updated Policy.',
  },
  {
    title: '14. Contact Us',
    content: 'If you have questions about this Privacy Policy or wish to exercise your privacy rights, contact:',
  },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 md:p-10 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-600">Effective Date: March 6, 2026</p>

        <div className="mt-8 space-y-8 text-slate-800">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>

              {section.content?.split('\n\n').map((paragraph) => (
                <p key={paragraph} className="leading-7">
                  {paragraph}
                </p>
              ))}

              {section.list && (
                <ul className="list-disc space-y-1 pl-6">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}

              {section.subsections?.map((subsection) => (
                <div key={subsection.subtitle} className="space-y-2 pt-1">
                  <h3 className="text-base font-semibold text-slate-900">{subsection.subtitle}</h3>
                  {subsection.content && <p className="leading-7">{subsection.content}</p>}
                  {subsection.list && (
                    <ul className="list-disc space-y-1 pl-6">
                      {subsection.list.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {section.afterList?.split('\n\n').map((paragraph) => (
                <p key={paragraph} className="leading-7">
                  {paragraph}
                </p>
              ))}

              {section.title === '14. Contact Us' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <p className="font-medium text-slate-900">Foundation Stone Advisors</p>
                  <p>
                    Email:{' '}
                    <a className="text-blue-700 underline" href="mailto:admin@foundationstoneadvisors.com">
                      admin@foundationstoneadvisors.com
                    </a>
                  </p>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
