"""
construire les deux fichiers de la visu économie
Entrées : donnees_brutes/ + tables_code_pays/noc_iso3.csv + tables_code_pays/para_nom_iso3.csv
Sorties : olympiques.csv et paralympiques.csv, à côté de ce script
  une ligne par pays et par édition : saison, annee, pays, nom, iso3, medailles, athletes, gdppc, pop
Se lance depuis n'importe quel dossier : les chemins partent de l'emplacement du script.
"""
from pathlib import Path
import pandas as pd

ICI = Path(__file__).resolve().parent   # visualizations/economie/data
RACINE = ICI.parents[2]                 # racine du projet
D = RACINE / "donnees_brutes"
T = RACINE / "tables_code_pays"
COLONNES = ["saison", "annee", "pays", "nom", "iso3", "medailles", "athletes", "gdppc", "pop"]

# ---------- Maddison : (iso3, annee) -> gdppc et pop ----------
mpd = pd.read_excel(f"{D}/mpd2023_web.xlsx", sheet_name="Full data")
mpd = mpd.rename(columns={"countrycode": "iso3", "year": "annee"})
mpd = mpd[mpd["annee"] >= 1960]
pib = mpd.loc[mpd["gdppc"].notna(), ["iso3", "annee", "gdppc"]]
# Population : en milliers dans Maddison, convertie en habitants
pop = mpd.loc[mpd["pop"].notna(), ["iso3", "annee", "pop"]]
pop["pop"] = (pop["pop"] * 1000).round().astype("Int64")


def ajouter_iso3_et_pib(df, table, cle):
    """Ajoute iso3 (via la table de correspondance) puis gdppc et pop (via Maddison)."""
    df["iso3"] = df["pays"].map(dict(zip(table[cle], table["iso3"])))
    manquants = df.loc[df["iso3"].isna(), "pays"].unique()
    if len(manquants):
        raise SystemExit(f"Pays absents de la table de correspondance : {list(manquants)}")
    return (df.merge(pib, on=["iso3", "annee"], how="left")
              .merge(pop, on=["iso3", "annee"], how="left"))


# ---------- Olympiques : compter par pays et par édition ----------
jo = pd.read_csv(f"{D}/Olympic_Athlete_Event_Results.csv")
jo = jo[jo["edition"].str.contains("Summer Olympics|Winter Olympics")]
jo["annee"] = jo["edition"].str[:4].astype(int)
jo = jo[jo["annee"] >= 1960]
jo["saison"] = jo["edition"].str.contains("Summer").map({True: "ete", False: "hiver"})
jo = jo.rename(columns={"country_noc": "pays"})
groupe = ["saison", "annee", "pays"]

# Athlètes : identifiants uniques (un athlète inscrit à 3 épreuves compte 1 fois)
athletes = jo.groupby(groupe)["athlete_id"].nunique().rename("athletes")

# Médailles : une médaille = un triplet (épreuve, pays, couleur) unique
# -> les 11 joueurs d'une équipe de football championne donnent 1 seule médaille
medailles = (jo[jo["medal"].notna()]
             .drop_duplicates(["result_id", "pays", "medal"])
             .groupby(groupe).size().rename("medailles"))

olymp = pd.concat([athletes, medailles], axis=1).fillna({"medailles": 0}).reset_index()
olymp["medailles"] = olymp["medailles"].astype(int)
olymp = ajouter_iso3_et_pib(olymp, pd.read_csv(f"{T}/noc_iso3.csv"), "noc")
noms = pd.read_csv(f"{T}/noc_iso3.csv")
olymp["nom"] = olymp["pays"].map(dict(zip(noms["noc"], noms["nom_cio"])))

# ---------- Paralympiques : déjà agrégé, on additionne ----------
para = pd.read_csv(f"{D}/paralympic_games.csv")
para["saison"] = para["games_type"].map({"Summer": "ete", "Winter": "hiver"})
para["medailles"] = para["gold"] + para["silver"] + para["bronze"]
para["athletes"] = para["participants_men"] + para["participants_women"]
para = para.rename(columns={"year": "annee", "country": "pays"})
para = ajouter_iso3_et_pib(para, pd.read_csv(f"{T}/para_nom_iso3.csv"), "country")
para["nom"] = para["pays"]

# ---------- Écriture ----------
olymp[COLONNES].sort_values(groupe).to_csv(ICI / "olympiques.csv", index=False)
para[COLONNES].sort_values(groupe).to_csv(ICI / "paralympiques.csv", index=False)


print("\nCouverture PIB : % des médailles des pays ayant un PIB, par édition")
for nom, df in [("Olympiques", olymp), ("Paralympiques", para)]:
    df = df[df["iso3"] != "exclu"]
    couv = (df[df["gdppc"].notna()].groupby(["saison", "annee"])["medailles"].sum()
            / df.groupby(["saison", "annee"])["medailles"].sum() * 100).round(1)
    print(f"  {nom} : min {couv.min()} %, éditions sous 95 % : {couv[couv < 95].to_dict()}")

