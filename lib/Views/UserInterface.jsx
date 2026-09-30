import PropTypes from "prop-types";
import { observer } from "mobx-react";
import { useViewState } from "terriajs/lib/ReactViews/Context";
import MobileMenuItem from "terriajs/lib/ReactViews/Mobile/MobileMenuItem";
import RelatedMaps from "terriajs/lib/ReactViews/RelatedMaps/RelatedMaps";
import { MenuLeft } from "terriajs/lib/ReactViews/StandardUserInterface/customizable/Groups";
import MenuStyles from "terriajs/lib/ReactViews/StandardUserInterface/customizable/menu-button.scss";
import StandardUserInterface from "terriajs/lib/ReactViews/StandardUserInterface/StandardUserInterface";
import Icon from "terriajs/lib/Styled/Icon";
import version from "../../version";

const CaroniLink = observer(({ caption, href }) => {
  const viewState = useViewState();

  if (viewState.useSmallScreenInterface) {
    return (
      <MobileMenuItem>
        <MobileMenuItem.Link href={href}>{caption}</MobileMenuItem.Link>
      </MobileMenuItem>
    );
  }

  return (
    <a
      className={MenuStyles.btnAboutLink}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={caption}
    >
      <Icon glyph={Icon.GLYPHS.externalLink} />
      <span>{caption}</span>
    </a>
  );
});

CaroniLink.propTypes = {
  caption: PropTypes.string.isRequired,
  href: PropTypes.string.isRequired
};

export const TerriaUserInterface = ({ terria, viewState, themeOverrides }) => {
  const relatedMaps = viewState.terria.configParameters.relatedMaps;

  return (
    <StandardUserInterface
      terria={terria}
      viewState={viewState}
      themeOverrides={themeOverrides}
      version={version}
    >
      <MenuLeft>
        <CaroniLink
          caption="Sobre el proyecto"
          href="https://caroni.org.ve"
          key="caroni-project"
        />
        <CaroniLink
          caption="Catalogo Geodatos"
          href="https://catalogo.caroni.org.ve"
          key="caroni-geodata"
        />
        {relatedMaps && relatedMaps.length > 0 ? (
          <RelatedMaps relatedMaps={relatedMaps} />
        ) : null}
      </MenuLeft>
    </StandardUserInterface>
  );
};

TerriaUserInterface.propTypes = {
  terria: PropTypes.object.isRequired,
  viewState: PropTypes.object.isRequired,
  themeOverrides: PropTypes.object
};
