import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "../_components/JsonLd";
import { LegalArticle, LegalSection } from "../_components/LegalPage";
import { SiteFooter, SiteHeader } from "../_components/SiteChrome";
import { breadcrumbLd, graph, pageMetadata, webPageLd } from "@/lib/seo";
import { legalEmail, site } from "@/lib/site";

const path = "/acceptable-use";
const title = "Acceptable Use Policy";
const lastUpdated = "October 9, 2026";
const description = `Rules for responsible use of the ${site.name}, including rate limits and prohibited activity.`;

export const metadata: Metadata = pageMetadata({ title, description, path });

export default function AcceptableUsePage() {
  return (
    <>
      <SiteHeader />
      <LegalArticle
        title={title}
        lastUpdated={lastUpdated}
        breadcrumbLabel="Acceptable Use Policy"
        intro={
          <p>
            This Acceptable Use Policy applies to anyone who accesses the {site.name} (the &quot;Service&quot;),
            whether through the REST API directly, through an application you build on it, or through the home page
            playground. It is part of, and should be read together with, our{" "}
            <Link href="/terms" className="text-[#0066cc] hover:underline">Terms of Use</Link>. We may suspend or
            terminate access for a violation of this policy, as described in the Terms.
          </p>
        }
      >
        <LegalSection id="prohibited" heading="1. Prohibited activity">
          <p>You may not use the Service to:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>violate any applicable law or regulation, or the rights of any third party, including intellectual property, privacy, or publicity rights;</li>
            <li>store or transmit content that is unlawful, defamatory, harassing, or that contains malware or other harmful code;</li>
            <li>access, or attempt to access, another user&apos;s account, tasks, or data without authorization;</li>
            <li>reverse engineer, decompile, or attempt to extract the source code of the Service, except to the extent such a restriction is prohibited by applicable law;</li>
            <li>misrepresent your identity, impersonate another person or entity, or falsify your affiliation with any person or entity; or</li>
            <li>use the Service to build a product or service that is substantially similar to, and competes directly with, the Service, using data or access obtained from it in a way not permitted by these policies.</li>
          </ul>
        </LegalSection>

        <LegalSection id="security-testing" heading="2. Security testing and research">
          <p>
            We welcome good-faith security research. However, you may not probe, scan, or test the Service for
            vulnerabilities, attempt to bypass authentication or rate limiting, or perform load testing against the
            production API, without our prior written permission. If you believe you have found a security issue,
            please report it to us directly at{" "}
            <Link href={`mailto:${legalEmail}`} className="text-[#0066cc] hover:underline">{legalEmail}</Link> rather
            than disclosing it publicly, and give us a reasonable opportunity to address it before any public
            disclosure.
          </p>
        </LegalSection>

        <LegalSection id="automated-use" heading="3. Automated use and rate limits">
          <p>
            The Service applies rate limits to certain endpoints, in particular account registration, login, and
            password-reset requests, to protect user accounts and the availability of the Service for everyone. Rate
            limit values and the response headers used to signal them are described in the{" "}
            <Link href="/docs" className="text-[#0066cc] hover:underline">API documentation</Link>.
          </p>
          <p>You agree not to:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>attempt to evade a rate limit, for example by rotating IP addresses, accounts, or identifiers for that purpose;</li>
            <li>send automated requests designed to guess passwords, enumerate registered email addresses, or otherwise attack user accounts;</li>
            <li>generate a volume of traffic to the Service that is disproportionate to genuine use and that risks degrading it for other users; or</li>
            <li>use automated means to scrape or bulk-extract data from the Service beyond your own account&apos;s data, accessed through the documented API.</li>
          </ul>
          <p>
            If your intended use requires higher limits than those published in the documentation, contact us at the
            address above before building against the assumption of higher limits.
          </p>
        </LegalSection>

        <LegalSection id="api-usage" heading="4. Responsible API integration">
          <p>
            If you build an application on top of the Service, you are responsible for how your application and its
            users interact with the API, including obtaining any consent your own users need to give before you submit
            their data to the Service on their behalf, and for complying with applicable law in how you collect, use,
            and disclose data within your own application.
          </p>
          <p>
            Because the API uses bearer tokens rather than cookies for authentication, you are responsible for storing
            tokens issued to your application securely and for not exposing them in client-side code, public
            repositories, or logs accessible to others.
          </p>
        </LegalSection>

        <LegalSection id="enforcement" heading="5. Enforcement">
          <p>
            We may investigate suspected violations of this policy and take action we consider appropriate, which may
            include issuing a warning, removing or disabling access to specific content, temporarily or permanently
            suspending or terminating an account, and reporting conduct to law enforcement where required or
            appropriate. Where practical, and where we do not believe doing so would create a security risk, we will
            give notice before taking action.
          </p>
        </LegalSection>

        <LegalSection id="changes" heading="6. Changes to this policy">
          <p>
            We may update this Acceptable Use Policy from time to time, in the same way and for the same reasons
            described in our <Link href="/terms" className="text-[#0066cc] hover:underline">Terms of Use</Link>. We
            will update the &quot;Last updated&quot; date above when we do.
          </p>
        </LegalSection>

        <LegalSection id="contact" heading="7. Contact">
          <p>
            To report a violation of this policy, or to ask about a use case not covered here, contact us at{" "}
            <Link href={`mailto:${legalEmail}`} className="text-[#0066cc] hover:underline">{legalEmail}</Link>.
          </p>
        </LegalSection>
      </LegalArticle>
      <SiteFooter />
      <JsonLd
        data={graph(
          webPageLd({ path, name: title, description, type: "WebPage" }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Acceptable Use Policy", path },
          ])
        )}
      />
    </>
  );
}
