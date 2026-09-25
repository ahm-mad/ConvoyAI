// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import convoyai from '../GuestHomeComponents/assets/convoyainew.png';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';

function NonAuthFooter() {
  const FooterContent = true;
  return (
    <>
      {FooterContent ? (
        <div className=" bg-[#FAFAFA] w-full p-6">
          <div className="flex justify-between">
            <div className="w-32  flex max-h-14">
              <img src={convoyai} alt="ConvoyAI Image" />
            </div>

            <div className="flex flex-wrap text-[#00263e] gap-28 mr-36">
              <div className="flex flex-col flex-wrap">
                <div className="font-bold ">ConvoyAI</div>
                <div className="flex flex-col gap-2 mt-3 ">
                  <div>Platform</div>
                  <div>About</div>
                  <div>Contact</div>
                </div>
              </div>
              <div className="flex flex-col flex-wrap">
                <div className="font-bold ">Resources</div>
                <div className="flex flex-col gap-2 mt-3 ">
                  <div>Security & Compliance</div>
                  <div>Developers</div>
                  <div>Support</div>
                  <div>Device Manufacturers</div>
                </div>
              </div>
              <div className="flex flex-col flex-wrap">
                <div className="font-bold ">Log in</div>
                <div className="flex flex-col gap-2 mt-3 ">
                  <div>Sensor Store</div>
                  <div>IoT in a Box</div>
                  <div>Cayenne</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2  p-2 mt-12">
            <div className="flex flex-wrap gap-6">
              <div>
                <FacebookIcon fontSize="small" />
              </div>
              <div>
                <TwitterIcon fontSize="small" />
              </div>
              <div>
                <LinkedInIcon fontSize="small" />
              </div>
              <div>
                <InstagramIcon fontSize="small" />
              </div>
            </div>
            <div className="flex flex-wrap gap-8">
              <div>Terms of Service</div>
              <div>Privacy</div>
              <div>Cookie Policy</div>
              <div>CCPA</div>
              <div>© 2025 ConvoyAI, Inc.</div>
            </div>
          </div>
        </div>
      ) : (
        <div> </div>
      )}
    </>
  );
}

export default NonAuthFooter;
