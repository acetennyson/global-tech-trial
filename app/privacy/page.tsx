import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "../_components/JsonLd";
import { LegalArticle, LegalSection } from "../_components/LegalPage";
import { SiteFooter, SiteHeader } from "../_components/SiteChrome";
import { breadcrumbLd, graph, pageMetadata, webPageLd } from "@/lib/seo";
import { legalEmail, placeLabel, site } from "@/lib/site";

const path = "/privacy";
const title = "Privacy Policy";
const lastUpdated = "October 9, 2026";
const description = `How ${site.organization.name} collects, uses, and protects personal data through the ${site.name}.`;

export const metadata: Metadata = pageMetadata({ title, description, path });

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <LegalArticle
        title={title}
        lastUpdated={lastUpdated}
        breadcrumbLabel="Privacy Policy"
        intro={
          <>
            <p>
              This Privacy Policy explains what personal data {site.owner.name}, operating as {site.organization.name}{" "}
              (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), collects through the {site.name} (the
              &quot;Service&quot;), why we collect it, and the choices you have. It applies to anyone who registers an
              account, uses the API, or visits the website at {site.name}, including the home page playground.
            </p>
            <p>
              We are based in {placeLabel}, and the Service is a small, developer-facing REST API. We collect only the
              data described below, and we do not sell personal data to anyone.
            </p>
          </>
        }
      >
        <LegalSection id="data-we-collect" heading="1. Data we collect">
          <p>We collect the following categories of data:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Account data.</strong> When you register, we collect your email address and password, and your
              name if you choose to provide one. Your password is never stored in readable form; it is hashed with
              bcrypt before it is saved, and we cannot retrieve or view your original password.
            </li>
            <li>
              <strong>Task data.</strong> Any task you create through the API, including its title, description, status,
              and other fields you submit, is stored against your account so the Service can return it to you.
            </li>
            <li>
              <strong>Authentication data.</strong> When you log in, we issue a signed JSON Web Token (JWT) that your
              client sends back on later requests. We do not use cookies for authentication; the token itself is held
              by your client, not by us, though the server verifies it on each request.
            </li>
            <li>
              <strong>Password-reset data.</strong> If you request a password reset, we generate a single-use token,
              store a hashed version of it with an expiry time, and send a reset link to the email address on your
              account.
            </li>
            <li>
              <strong>Technical and rate-limiting data.</strong> To protect the Service from abuse, we temporarily
              record counts of requests to sign-in related endpoints, keyed to your IP address and, for login and
              password-reset attempts, a hashed version of the email address involved. We also process standard
              technical data that any web server or API sees as part of a request, such as IP address, timestamp, and
              user agent, mainly in operational logs.
            </li>
            <li>
              <strong>Website usage data.</strong> The Service does not use analytics or advertising cookies. If you
              use the in-page API playground, the requests you make are sent to the same API endpoints described above
              and are treated the same way.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="how-we-use" heading="2. How we use your data">
          <p>We use the data described above to:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>create and secure your account, and authenticate your requests;</li>
            <li>store and return your tasks, and support features such as version checks, idempotent creates, and offline sync;</li>
            <li>send transactional email, specifically password-reset links, when you ask for one;</li>
            <li>detect and limit abusive or automated behavior, such as credential-stuffing attempts against the login endpoint;</li>
            <li>maintain the security, integrity, and availability of the Service, including through logging and debugging; and</li>
            <li>comply with legal obligations, and respond to lawful requests from public authorities.</li>
          </ul>
          <p>
            We do not use your task content or account data to train machine-learning models, and we do not use it for
            advertising or marketing to third parties.
          </p>
        </LegalSection>

        <LegalSection id="legal-basis" heading="3. Legal basis for processing">
          <p>
            If you are located in the European Economic Area, the United Kingdom, or another jurisdiction with similar
            requirements, our legal bases for processing your personal data are: performance of a contract (to provide
            the Service you sign up for), our legitimate interests (to secure the Service, prevent abuse, and operate
            it reliably, balanced against your rights), and compliance with a legal obligation where applicable. Where
            we rely on consent, for example for an optional communication, you may withdraw that consent at any time.
          </p>
        </LegalSection>

        <LegalSection id="sharing" heading="4. Who we share data with">
          <p>
            We do not sell your personal data. We share it only with the service providers who help us run the Service,
            and only to the extent needed for that purpose:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Database hosting.</strong> Account and task data is stored in a managed Postgres database. The
              database provider processes this data on our behalf and does not use it for its own purposes.
            </li>
            <li>
              <strong>Application hosting.</strong> The API and website run on a cloud hosting and deployment platform,
              which processes requests to the Service and may retain request-level logs for a limited period.
            </li>
            <li>
              <strong>Email delivery.</strong> Password-reset emails are sent through a third-party email service.
              Sending a reset email requires sharing the recipient&apos;s email address with that provider.
            </li>
          </ul>
          <p>
            We may also disclose personal data if required to do so by law, in response to a valid legal process, or
            where necessary to protect the rights, property, or safety of {site.organization.name}, our users, or
            others. If the Service, or substantially all of its assets, is transferred as part of a merger, acquisition,
            or sale, personal data may be transferred as part of that transaction, subject to this Privacy Policy or a
            successor policy of which you will be notified.
          </p>
        </LegalSection>

        <LegalSection id="transfers" heading="5. International data transfers">
          <p>
            Our service providers may process and store data in countries other than your own, including outside the
            European Economic Area or the United Kingdom. Where we transfer personal data internationally, we rely on
            the provider&apos;s own compliance mechanisms, such as standard contractual clauses or an equivalent
            safeguard, where applicable law requires one.
          </p>
        </LegalSection>

        <LegalSection id="retention" heading="6. How long we keep data">
          <p>
            We keep your account and task data for as long as your account remains active, and for a reasonable period
            after that to allow you to recover your account or as required to meet legal, accounting, or security
            obligations. If you delete a task, it is initially retained in a deleted state (a &quot;tombstone&quot;) so
            that other clients can learn about the deletion during offline sync, and is permanently removed on a
            regular cleanup schedule, typically after 30 days. Password-reset tokens expire after one hour and are
            invalidated once used. Rate-limiting counters are short-lived and are cleared automatically once the
            relevant time window passes.
          </p>
          <p>
            If you delete your account, we delete or anonymize your personal data within a reasonable period, except
            where we are required to retain certain records by law, or where data has already been fully anonymized or
            aggregated such that it no longer identifies you.
          </p>
        </LegalSection>

        <LegalSection id="security" heading="7. Security">
          <p>
            We apply technical measures designed to protect your data, including password hashing with bcrypt,
            parameterized database queries, signed and expiring authentication tokens, rate limiting on sign-in
            endpoints, and transport encryption (HTTPS) for data in transit. No method of transmission or storage is
            completely secure, and we cannot guarantee absolute security. If we become aware of a security incident
            that affects your personal data, we will notify you and any applicable authority as required by law.
          </p>
        </LegalSection>

        <LegalSection id="your-rights" heading="8. Your rights and choices">
          <p>
            Depending on where you live, you may have the right to access the personal data we hold about you, correct
            it, request its deletion, object to or restrict certain processing, or receive a copy of it in a portable
            format. You can access and update most of your account data, and create or delete tasks, directly through
            the API. For anything the API does not cover, including account deletion, contact us at{" "}
            <Link href={`mailto:${legalEmail}`} className="text-[#0066cc] hover:underline">{legalEmail}</Link>, and we
            will respond within a reasonable time and in accordance with applicable law.
          </p>
          <p>
            If you are in the European Economic Area or the United Kingdom, you also have the right to lodge a
            complaint with your local data protection authority. If you are a California resident, you may have
            additional rights under the California Consumer Privacy Act, including the right to know what personal
            information we collect and the right to request its deletion; we do not sell personal information as
            defined by that law.
          </p>
        </LegalSection>

        <LegalSection id="children" heading="9. Children&apos;s privacy">
          <p>
            The Service is not directed to, and is not intended for use by, anyone under 18 years of age. We do not
            knowingly collect personal data from children. If you believe a child has provided us with personal data,
            contact us at the address below and we will take reasonable steps to delete it.
          </p>
        </LegalSection>

        <LegalSection id="cookies" heading="10. Cookies and local storage">
          <p>
            The Service does not use tracking or advertising cookies. Authentication is handled with a bearer token
            that your own client is responsible for storing, not a cookie we set. If the in-page API playground uses
            your browser&apos;s local storage to hold a token between page loads for your convenience, that data stays
            on your device and is not transmitted to us except as part of an API request you make.
          </p>
        </LegalSection>

        <LegalSection id="changes" heading="11. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time to reflect changes to the Service or to applicable law.
            We will update the &quot;Last updated&quot; date above when we do, and where a change is material we will
            make reasonable efforts to notify account holders, for example by email, before it takes effect.
          </p>
        </LegalSection>

        <LegalSection id="contact" heading="12. Contact">
          <p>
            For any question about this Privacy Policy or how we handle your data, contact us at{" "}
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
            { name: "Privacy Policy", path },
          ])
        )}
      />
    </>
  );
}
