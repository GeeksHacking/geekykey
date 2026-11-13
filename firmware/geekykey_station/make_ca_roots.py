# Regenerates both sketches' ca_roots.h, the roots their HTTPS clients trust.
#
#   curl -O https://curl.se/ca/cacert.pem   # Mozilla's root store, as curl publishes it
#   python3 make_ca_roots.py                # writes both sketches' ca_roots.h
#
# Run it again when Cloudflare adds a certificate authority: the list below is
# every root in Mozilla's store for the four CAs Cloudflare issues from, plus
# Sectigo and USERTrust for its backup certificates. It also covers Google Trust
# Services, which answers the staging run.app address. One missing name and the
# script fails rather than writing a half-filled file. Kept verbatim from the
# message to Zi Tao (.scratch/db-hosting/assets/message-to-zi-tao-station-contract.md).

import re
from pathlib import Path
names = ["ISRG Root X1", "ISRG Root X2", "GTS Root R1", "GTS Root R3", "GTS Root R4",
         "SSL.com TLS RSA Root CA 2022", "SSL.com TLS ECC Root CA 2022",
         "SSL.com Root Certification Authority RSA", "SSL.com Root Certification Authority ECC",
         "Certum Trusted Network CA", "USERTrust RSA Certification Authority",
         "USERTrust ECC Certification Authority",
         "Sectigo Public Server Authentication Root E46",
         "Sectigo Public Server Authentication Root R46"]
blocks = dict(re.findall(r"\n\n([^\n]+)\n=+\n(-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----)",
                         open("cacert.pem").read(), re.S))
# Build before writing so a missing root cannot truncate either copy.
header = "#pragma once\n// Roots for Cloudflare's CAs, from Mozilla's store (curl.se/ca/cacert.pem)\n"
header += 'const char CA_ROOTS[] = R"PEM(\n' + "\n".join(f"# {n}\n{blocks[n]}" for n in names) + '\n)PEM";\n'
folder = Path(__file__).resolve().parent
for destination in (folder / "ca_roots.h", folder.parent / "token_writer" / "ca_roots.h"):
    destination.write_text(header)
