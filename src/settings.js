var settings = {
  SHARED_SECRET: '952b4412f002315aa50751032fcaab03',
  /* ENDPOINT should start with protocol */
  ENDPOINT: 'https://api.windscribe.com/',
  BACKUP_ENDPOINT: 'https://api.staticnetcontent.com/',
  LNK:{
    LNK_MY_ACC: 'https://windscribe.com/myaccount?ext_session={SESSION_PLACEHOLDER}',
    LNK_HLP: 'https://windscribe.com/help',
    LNK_UPGRD: 'https://windscribe.com/upgrade',
    LNK_PSSWRD_FRGT: 'https://windscribe.com/forgotpassword',
    LNK_SIGNUP: 'https://windscribe.com/signup?ws_ext'
  },
  // default PAC endpoints should not have protocol in the beginning, it is stated in the PAC
  DEFAULT_PAC_ENDPOINT: 'nl-007.whiskergalaxy.com',
  BACKUP_DEFAULT_PAC_ENDPOINT: 'nl-004.whiskergalaxy.com',
  CHECK_IPV4_URL: 'https://checkipv4.windscribe.com/',
  CHECK_NOSSL_URL: 'http://nosslscribe.com/',
  INTERVALS:{
    SESSION_UPDATE: 60*1000
  },
  EXTRHDRS: [
    new RegExp('^.*\\.windscribe\\.com$', 'i'),
    new RegExp('^windscribe\\.com$', 'i')
  ],
  KNOWN_FLAGS: [
    "AD.png", "AE.png", "AF.png", "AG.png", "AI.png", "AL.png", "AM.png", "AN.png", "AO.png",
    "AQ.png", "AR.png", "AS.png", "AT.png", "AU.png", "AW.png", "AX.png", "AZ.png", "BA.png",
    "BB.png", "BD.png", "BE.png", "BF.png", "BG.png", "BH.png", "BI.png", "BJ.png", "BL.png",
    "BM.png", "BN.png", "BO.png", "BR.png", "BS.png", "BT.png", "BW.png", "BY.png", "BZ.png",
    "CA.png", "CC.png", "CD.png", "CF.png", "CG.png", "CH.png", "CI.png", "CK.png", "CL.png",
    "CM.png", "CN.png", "CO.png", "CR.png", "CU.png", "CV.png", "CW.png", "CX.png", "CY.png",
    "CZ.png", "DE.png", "DJ.png", "DK.png", "DM.png", "DO.png", "DZ.png", "EC.png", "EE.png",
    "EG.png", "EH.png", "ER.png", "ES.png", "ET.png", "EU.png", "FI.png", "FJ.png", "FK.png",
    "FM.png", "FO.png", "FR.png", "GA.png", "GB.png", "GD.png", "GE.png", "GG.png", "GH.png",
    "GI.png", "GL.png", "GM.png", "GN.png", "GQ.png", "GR.png", "GS.png", "GT.png", "GU.png",
    "GW.png", "GY.png", "HK.png", "HN.png", "HR.png", "HT.png", "HU.png", "IC.png", "ID.png",
    "IE.png", "IL.png", "IM.png", "IN.png", "IQ.png", "IR.png", "IS.png", "IT.png", "JE.png",
    "JM.png", "JO.png", "JP.png", "KE.png", "KG.png", "KH.png", "KI.png", "KM.png", "KN.png",
    "KP.png", "KR.png", "KW.png", "KY.png", "KZ.png", "LA.png", "LB.png", "LC.png", "LI.png",
    "LK.png", "LR.png", "LS.png", "LT.png", "LU.png", "LV.png", "LY.png", "MA.png", "MC.png",
    "MD.png", "ME.png", "MF.png", "MG.png", "MH.png", "MK.png", "ML.png", "MM.png", "MN.png",
    "MO.png", "MP.png", "MQ.png", "MR.png", "MS.png", "MT.png", "MU.png", "MV.png", "MW.png",
    "MX.png", "MY.png", "MZ.png", "NA.png", "NC.png", "NE.png", "NF.png", "NG.png", "NI.png",
    "NL.png", "NO.png", "NP.png", "NR.png", "NU.png", "NZ.png", "OM.png", "PA.png", "PE.png",
    "PF.png", "PG.png", "PH.png", "PK.png", "PL.png", "PN.png", "PR.png", "PS.png", "PT.png",
    "PW.png", "PY.png", "QA.png", "RO.png", "RS.png", "RU.png", "RW.png", "SA.png", "SB.png",
    "SC.png", "SD.png", "SE.png", "SG.png", "SH.png", "SI.png", "SK.png", "SL.png", "SM.png",
    "SN.png", "SO.png", "SR.png", "SS.png", "ST.png", "SV.png", "SY.png", "SZ.png", "TC.png",
    "TD.png", "TF.png", "TG.png", "TH.png", "TJ.png", "TK.png", "TL.png", "TM.png", "TN.png",
    "TO.png", "TR.png", "TT.png", "TV.png", "TW.png", "TZ.png", "UA.png", "UG.png", "US.png",
    "UY.png", "UZ.png", "VA.png", "VC.png", "VE.png", "VG.png", "VI.png", "VN.png", "VU.png",
    "WF.png", "WS.png", "YE.png", "YT.png", "ZA.png", "ZM.png", "ZW.png", "_abkhazia.png",
    "_basque-country.png", "_british-antarctic-territory.png", "_commonwealth.png",
    "_england.png", "_gosquared.png", "_kosovo.png", "_mars.png", "_nagorno-karabakh.png",
    "_nato.png", "_northern-cyprus.png", "_olympics.png", "_red-cross.png", "_scotland.png",
    "_somaliland.png", "_south-ossetia.png", "_united-nations.png", "_unknown.png", "_wales.png"
  ],
  "whitelistschemes": "about chrome file irc moz-safe-about news resource snews x-jsd addbook cid imap mailbox nntp pop data javascript moz-icon",
  "whitelistDefault": [{url:"windscribe.com"}],
  "slinks_protocols": ['http', 'https', 'mailbox', 'imap', 'news', 'snews'],
  "data_directory": "windscribe",
  "purge_storage_for_older_versions": false,
  "WS_GRP_MIN": 1,
  "WS_GRP_MAX": 100
};

module.exports = settings;