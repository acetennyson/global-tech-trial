import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "../_components/JsonLd";
import { LegalArticle, LegalSection } from "../_components/LegalPage";
import { SiteFooter, SiteHeader } from "../_components/SiteChrome";
import { breadcrumbLd, graph, pageMetadata, webPageLd } from "@/lib/seo";
import { legalEmail, site } from "@/lib/site";

const path = "/terms";
const title = "Terms of Use";
const lastUpdated = "October 9, 2026";
const description = `The terms that govern your use of the ${site.name}, including accounts, acceptable use, and liability.`;

export const metadata: Metadata = pageMetadata({ title, description, path });

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <LegalArticle
        title={title}
        lastUpdated={lastUpdated}
        breadcrumbLabel="Terms of Use"
        intro={
          <>
            <p>
              These Terms of Use (&quot;Terms&quot;) are an agreement between you and {site.owner.name}, operating as{" "}
              {site.organization.name} (&quot;{site.organization.name}&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;),
              and govern your access to and use of the {site.name} (the &quot;Service&quot;), including its REST API, the
              documentation at <Link href="/docs" className="text-[#0066cc] hover:underline">/docs</Link>, and the in-page
              API playground on the home page.
            </p>
            <p>
              By creating an account, sending a request to the Service, or otherwise accessing the Service, you agree to
              these Terms. If you do not agree to these Terms, do not use the Service. If you are using the Service on
              behalf of a company or other legal entity, you represent that you have the authority to bind that entity,
              and &quot;you&quot; in these Terms refers to that entity.
            </p>
          </>
        }
      >
        <LegalSection id="service" heading="1. The Service">
          <p>
            The Service is a REST API for managing tasks. It provides JWT-based authentication, version-checked edits,
            idempotent task creation, bulk operations, and an offline synchronization endpoint, as described in the
            documentation. The Service is provided on an as-is basis and may be used for personal projects, demonstrations,
            and the integration of task management into your own applications.
          </p>
          <p>
            The Service is offered free of charge at this time. We may introduce paid plans, usage limits, or other
            changes to availability in the future, and we will update these Terms or the documentation if we do.
          </p>
        </LegalSection>

        <LegalSection id="eligibility" heading="2. Eligibility and accounts">
          <p>
            You must be at least 18 years old, or the age of legal majority in your jurisdiction, to create an account.
            By registering, you represent that the information you provide, including your email address, is accurate
            and that you will keep it up to date.
          </p>
          <p>
            You are responsible for keeping your password and any access token confidential, and for all activity that
            takes place under your account. Notify us promptly at{" "}
            <Link href={`mailto:${legalEmail}`} className="text-[#0066cc] hover:underline">{legalEmail}</Link> if you
            believe your account or an access token has been compromised. We are not liable for any loss arising from
            unauthorized use of your account that results from your failure to safeguard your credentials.
          </p>
          <p>
            You may delete your account at any time by contacting us at the address above. We may suspend or terminate
            an account as described in Section 8.
          </p>
        </LegalSection>

        <LegalSection id="acceptable-use" heading="3. Acceptable use">
          <p>
            You agree to use the Service only for lawful purposes and in accordance with these Terms. The specific rules
            on request volume, automated use, and prohibited conduct are set out in our{" "}
            <Link href="/acceptable-use" className="text-[#0066cc] hover:underline">Acceptable Use Policy</Link>, which
            is incorporated into these Terms by reference. Without limiting that policy, you agree not to:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>use the Service to store, transmit, or process unlawful content, or content that infringes the rights of a third party;</li>
            <li>attempt to gain unauthorized access to another user&apos;s account, data, or tasks;</li>
            <li>probe, scan, or test the Service for vulnerabilities, or attempt to interfere with its availability, without our prior written permission;</li>
            <li>circumvent or attempt to circumvent rate limits, authentication, or other access controls; or</li>
            <li>use the Service in a way that could disable, overburden, damage, or impair it, including for any other user.</li>
          </ul>
        </LegalSection>

        <LegalSection id="your-data" heading="4. Your content and data">
          <p>
            &quot;Your Content&quot; means the tasks, task metadata, and any other data you submit to the Service through
            your account. As between you and us, you retain all rights to Your Content. You grant us a limited license
            to host, store, process, and transmit Your Content solely to operate, maintain, and provide the Service to
            you, including returning it to you and to any third party you have authorized through your account
            credentials.
          </p>
          <p>
            You are solely responsible for Your Content and for ensuring you have the right to submit it. We do not
            review Your Content before it is stored, and we are not responsible for its accuracy or legality. Our
            handling of personal data you submit, including account information, is described in our{" "}
            <Link href="/privacy" className="text-[#0066cc] hover:underline">Privacy Policy</Link>.
          </p>
          <p>
            We do not currently offer a guaranteed data export or backup service. We recommend you keep your own copy
            of any data that is important to you.
          </p>
        </LegalSection>

        <LegalSection id="ip" heading="5. Our intellectual property">
          <p>
            The Service, including its source code, documentation, design, and the {site.name} name and logo, is owned
            by {site.owner.name} or licensed to {site.organization.name}, and is protected by applicable intellectual
            property laws. These Terms do not grant you any right, title, or interest in the Service, except the
            limited right to use it as permitted here. Where the underlying code is published under an open-source
            license, that license governs your rights to the code itself, separately from your right to use the hosted
            Service under these Terms.
          </p>
        </LegalSection>

        <LegalSection id="third-party" heading="6. Third-party services">
          <p>
            The Service relies on third-party infrastructure to operate, including hosting and deployment
            infrastructure, a managed Postgres database provider, and an email provider used to send password-reset
            messages. We select these providers carefully, but we do not control them and are not responsible for
            outages, data loss, or other failures that originate with them. Further detail on how these providers
            handle personal data is set out in our{" "}
            <Link href="/privacy" className="text-[#0066cc] hover:underline">Privacy Policy</Link>.
          </p>
        </LegalSection>

        <LegalSection id="disclaimer" heading="7. Disclaimer of warranties">
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;, WITHOUT WARRANTIES OF ANY KIND, EITHER
            EXPRESS OR IMPLIED, INCLUDING, WITHOUT LIMITATION, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
            ERROR-FREE, OR SECURE, THAT DEFECTS WILL BE CORRECTED, OR THAT THE SERVICE IS FREE OF VIRUSES OR OTHER
            HARMFUL COMPONENTS. YOU USE THE SERVICE AT YOUR OWN RISK.
          </p>
          <p>
            Nothing in these Terms excludes or limits a warranty, right, or liability that cannot lawfully be excluded
            or limited under the law that applies to you.
          </p>
        </LegalSection>

        <LegalSection id="liability" heading="8. Limitation of liability">
          <p>
            TO THE FULLEST EXTENT PERMITTED BY LAW, {site.owner.name.toUpperCase()} AND {site.organization.name.toUpperCase()} WILL
            NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF
            PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF, OR INABILITY TO USE, THE
            SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p>
            TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING OUT OF OR RELATED
            TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US, IF ANY, FOR USE OF
            THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM AROSE, OR (B) FIFTY UNITED STATES DOLLARS (US$50).
          </p>
        </LegalSection>

        <LegalSection id="termination" heading="9. Suspension and termination">
          <p>
            We may suspend or terminate your access to the Service, with or without notice, if we reasonably believe
            you have violated these Terms or our Acceptable Use Policy, if required to do so by law, or if we decide to
            discontinue the Service or a part of it. Where practical, we will give you advance notice and an
            opportunity to export Your Content before termination.
          </p>
          <p>
            You may stop using the Service and delete your account at any time. Sections 4 through 8, 10, and 11 survive
            termination of these Terms.
          </p>
        </LegalSection>

        <LegalSection id="changes" heading="10. Changes to these Terms">
          <p>
            We may update these Terms from time to time to reflect changes to the Service or for legal or operational
            reasons. We will update the &quot;Last updated&quot; date above when we do, and where a change is material
            we will make reasonable efforts to notify account holders, for example by email, before it takes effect.
            Your continued use of the Service after a change becomes effective means you accept the updated Terms.
          </p>
        </LegalSection>

        <LegalSection id="general" heading="11. Governing law and general terms">
          <p>
            These Terms are governed by the laws of the Republic of Cameroon, without regard to its conflict-of-law
            principles, except where a mandatory consumer-protection law of your own country of residence gives you
            additional rights that cannot be displaced by this choice of law. Any dispute arising out of or relating to
            these Terms or the Service will be subject to the exclusive jurisdiction of the competent courts of Douala,
            Cameroon, unless the mandatory law of your country of residence provides otherwise.
          </p>
          <p>
            If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full
            effect. Our failure to enforce a provision is not a waiver of our right to do so later. You may not assign
            or transfer these Terms without our prior written consent; we may assign these Terms in connection with a
            merger, acquisition, or sale of assets. These Terms, together with the Privacy Policy and the Acceptable
            Use Policy, constitute the entire agreement between you and us regarding the Service.
          </p>
        </LegalSection>

        <LegalSection id="contact" heading="12. Contact">
          <p>
            Questions about these Terms can be sent to{" "}
            <Link href={`mailto:${legalEmail}`} className="text-[#0066cc] hover:underline">{legalEmail}</Link>. You can
            also read more about who operates the Service on the{" "}
            <Link href="/about" className="text-[#0066cc] hover:underline">About page</Link>.
          </p>
        </LegalSection>
      </LegalArticle>
      <SiteFooter />
      <JsonLd
        data={graph(
          webPageLd({ path, name: title, description, type: "WebPage" }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Terms of Use", path },
          ])
        )}
      />
    </>
  );
}
