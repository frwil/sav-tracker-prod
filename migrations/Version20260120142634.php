<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260120142634 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE standard (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, curve_data JSON NOT NULL, feed_type VARCHAR(255) DEFAULT NULL, speculation_id INT NOT NULL, INDEX IDX_10F7D7875CB73291 (speculation_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE standard ADD CONSTRAINT FK_10F7D7875CB73291 FOREIGN KEY (speculation_id) REFERENCES speculation (id)');
        $this->addSql('ALTER TABLE flock ADD standard_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE flock ADD CONSTRAINT FK_769B31E26F9BFC42 FOREIGN KEY (standard_id) REFERENCES standard (id)');
        $this->addSql('CREATE INDEX IDX_769B31E26F9BFC42 ON flock (standard_id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE standard DROP FOREIGN KEY FK_10F7D7875CB73291');
        $this->addSql('DROP TABLE standard');
        $this->addSql('ALTER TABLE flock DROP FOREIGN KEY FK_769B31E26F9BFC42');
        $this->addSql('DROP INDEX IDX_769B31E26F9BFC42 ON flock');
        $this->addSql('ALTER TABLE flock DROP standard_id');
    }
}
