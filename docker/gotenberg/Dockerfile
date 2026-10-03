# Gotenberg for Document Template PDFs (ADR 0017), with Thai fonts that may
# ship in a container. The templates are set in Windows' Angsana New and Cordia
# New, whose licence keeps them on Windows; TLWG's own fontconfig rules stand
# in Kinnari, Umpush and Laksaman (TH SarabunPSK's metric twin) for them.
FROM gotenberg/gotenberg:8
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-thai-tlwg \
 && rm -rf /var/lib/apt/lists/*
USER gotenberg
