"""
Construit olympiques.csv, utilisé par les vues 2 (richesse) et 3 (pays hôte).
Entrées : 120 years of Olympic history/athlete_events.csv (Kaggle)
          donnees_brutes/mpd2023_web.xlsx (Maddison Project Database 2023)
          tables_code_pays/noc_iso3.csv (code CIO -> code ISO3 de Maddison)
Sortie : olympiques.csv, à côté de ce script
  une ligne par pays, par saison et par édition depuis 1960 :
  saison, annee, pays, nom, iso3, medailles, athletes, gdppc, pop
Se lance depuis n'importe quel dossier : python visualizations/economie/data/prep.py
"""
from pathlib import Path
import pandas as pd

ICI = Path(__file__).resolve().parent   # visualizations/economie/data
RACINE = ICI.parents[2]                 # racine du projet
T = RACINE / "tables_code_pays"
COLONNES = ["saison", "annee", "pays", "nom", "iso3", "medailles", "athletes", "gdppc", "pop"]

# ---------- Maddison : (iso3, annee) -> gdppc et pop ----------
mpd = pd.read_excel(RACINE / "donnees_brutes" / "mpd2023_web.xlsx", sheet_name="Full data")
mpd = mpd.rename(columns={"countrycode": "iso3", "year": "annee"})
mpd = mpd[mpd["annee"] >= 1960]
pib = mpd.loc[mpd["gdppc"].notna(), ["iso3", "annee", "gdppc"]]
# Population : en milliers dans Maddison, convertie en habitants
pop = mpd.loc[mpd["pop"].notna(), ["iso3", "annee", "pop"]]
pop["pop"] = (pop["pop"] * 1000).round().astype("Int64")

# ---------- Kaggle : compter par pays et par édition ----------
jo = pd.read_csv(RACINE / "120 years of Olympic history" / "athlete_events.csv")
jo = jo[jo["Year"] >= 1960]
jo["saison"] = jo["Season"].map({"Summer": "ete", "Winter": "hiver"})
jo = jo.rename(columns={"Year": "annee", "NOC": "pays"})
groupe = ["saison", "annee", "pays"]

# Athlètes : identifiants uniques (un athlète inscrit à 3 épreuves compte 1 fois)
athletes = jo.groupby(groupe)["ID"].nunique().rename("athletes")

# Médailles : une médaille = un triplet (épreuve, pays, couleur) unique
# -> les 11 joueurs d'une équipe de football championne donnent 1 seule médaille
medailles = (jo[jo["Medal"].notna()]
             .drop_duplicates(["Games", "Event", "pays", "Medal"])
             .groupby(groupe).size().rename("medailles"))

olymp = pd.concat([athletes, medailles], axis=1).fillna({"medailles": 0}).reset_index()
olymp["medailles"] = olymp["medailles"].astype(int)

# ---------- Jointure : code CIO -> ISO3 -> Maddison ----------
table = pd.read_csv(T / "noc_iso3.csv")
olymp["iso3"] = olymp["pays"].map(dict(zip(table["noc"], table["iso3"])))
manquants = olymp.loc[olymp["iso3"].isna(), "pays"].unique()
if len(manquants):
    raise SystemExit(f"Pays absents de tables_code_pays/noc_iso3.csv : {list(manquants)}")
olymp["nom"] = olymp["pays"].map(dict(zip(table["noc"], table["nom_cio"])))
olymp = (olymp.merge(pib, on=["iso3", "annee"], how="left")
              .merge(pop, on=["iso3", "annee"], how="left"))

olymp[COLONNES].sort_values(groupe).to_csv(ICI / "olympiques.csv", index=False)
print(f"olympiques.csv : {len(olymp)} lignes")
